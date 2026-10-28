'use strict';
// Navigation phase 5: one development layout on the page and the map (docs/architecture-review/navigation-design.md §3.6).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const JS = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));

// N-8 / NP-5: what has no producer or no caller goes before the layout moves (S4).
test('dead code goes first: no Events copy in js/fsr.js, no dev export scope, no handler without a producer', () => {
  assert.doesNotMatch(src('js/fsr.js'), /function devHistoryHTML\(|function devEvents\(|function keyEvents\(|function evListHTML\(|data-tl="key"/);
  assert.doesNotMatch(src('js/exports.js'), /\bdev: \{ title: 'Development servicing summary'|#pane-dev-body|scope === 'dev'/);
  assert.doesNotMatch(src('js/overview-tab.js'), /data-ov-devsec/);
  assert.doesNotMatch(src('js/panel.js'), /\[data-pnl-fsr\]|'data-pnl-fsr'/);
  assert.doesNotMatch(src('js/dev-nav.js'), /function showTl\(|closest\('\[data-tl\]'\)/);
  // (a toggle without a handler, or a handler without a toggle, would be a dead button again)
  for (const f of JS) assert.doesNotMatch(src(`js/${f}`), /data-tlv?="|\[data-tlv?\]/, `js/${f}`);
  // The live Events toggle is devtab's, with its own handler.
  const dt = src('js/devtab.js');
  assert.match(dt, /function storyHTML\(/);
  assert.match(dt, /data-dt-tl="key"/);
  assert.match(dt, /const tl = e\.target\.closest\('\[data-dt-tl\]'\);\n\s+if \(tl\) \{ histView\(/);
});

// ---- S5: the Overview at a development (About, the approvals timeline, At a glance; the card gone) ----------
const fnOf = (s, name) => { const m = new RegExp(`function ${name}\\([\\s\\S]*?\\n  \\}`).exec(s); assert.ok(m, `function ${name}`); return m[0]; };
// A DevTab loaded in a context of its own, with a document holding Records' body (the full view's host), and
// the development model it reads (js/dev-detail.js, js/dev-nav.js: S13), loaded after it as index.html does.
function devTab(scoped) {
  const body = { dataset: {}, innerHTML: '' }, on = {};
  const document = { getElementById: id => (id === 'records-body' ? body : null), querySelectorAll: () => [], addEventListener: (t, f) => { (on[t] = on[t] || []).push(f); }, documentElement: { classList: { contains: () => false } } };
  const ctx = { document, PeelPhases: require('../js/phases.js'), PeelUtil: require('../js/util.js'), PeelDemand: require('../js/demand.js'), PeelMapCore: { map: {} }, DevScope: { current: () => scoped }, console };
  ctx.window = ctx; ctx.globalThis = ctx;
  for (const f of ['js/devtab.js', 'js/dev-detail.js', 'js/dev-nav.js']) require('node:vm').runInNewContext(src(f), ctx);
  return { DT: ctx.DevTab, body, ctx, on };
}
const stubDev = (extra = {}) => ({
  key: 'Brampton|1 MAIN ST', title: '1 Main St', municipality: 'Brampton', phase: 'review', rank: 2, last: null, first: null,
  records: [{ uid: 'u1', ref: 'OZ 24-001', kind: 'application', stage: 'master', phase: 'review', statusRaw: 'Under review', events: [], description: '', address: '1 Main St', type: 'Zoning' }],
  timeline: [{ date: new Date('2024-03-01'), phase: 'review', text: 'OZ 24-001 · Initial submission', tag: 'OZ 24-001', record: 'u1' }],
  milestones: { review: new Date('2024-03-01') }, planApproved: null, phaseRecs: null, ...extra,
});

test('the Overview at a development: At a glance by the site\'s type, with the count note', () => {
  const ov = src('js/overview-tab.js');
  const kv = (label, value) => ({ html: `<div class="pnl-kv"><span>${label}</span><span>${value}</span></div>`, kv: true, label, value });
  const note = '<p class="small muted count-note" data-count="previous"><strong>Counted from its permits</strong>.</p>';
  const root = { PeelPanel: { kv }, PeelTreeCounts: { noteHTML: p => (p.count ? note : '') } };
  const fmtNum = n => Number(n).toLocaleString('en-CA'), fmt1 = n => (Math.round(n * 10) / 10).toFixed(1), roundPop = n => Math.round(n / 10) * 10;
  const atGlance = new Function('root', 'esc', 'fmtNum', 'fmt1', 'roundPop', `${fnOf(ov, 'atGlance')}; return atGlance;`)(root, s => String(s), fmtNum, fmt1, roundPop);
  const res = atGlance({}, { pe: { totalUnits: 100, population: 280 }, em: null, jobs: 0, useTxt: 'employment', kind: 'residential' });
  assert.deepEqual(res.map(r => [r.label, r.value]), [['Planned', '100 units'], ['At build-out', '280 people'], ['People per unit', '2.80 ppu']]);
  assert.equal(atGlance({ unitsLost: 3 }, { pe: { totalUnits: 100, population: 280 }, jobs: 0, kind: 'residential' })[0].label, 'Net of 3 demolished');
  const emp = atGlance({ siteAreaHa: 4.25 }, { pe: { totalUnits: 0, population: 0 }, em: { totalM2: 12000 }, jobs: 240, useTxt: 'industrial', kind: 'employment' });
  assert.deepEqual(emp.map(r => [r.label, r.value]), [['On the site', '240 jobs'], ['Industrial floor area', '12,000 m²'], ['Site area', '4.3 ha']]);
  // A mixed site with its count note: units, people, jobs, floor area and the note, five rows, the panel's
  // limit (no "See all" without a target); the note last.
  const mixed = atGlance({ count: { mode: 'previous', why: 'no tree entry' } }, { pe: { totalUnits: 50, population: 120 }, em: { totalM2: 5000 }, jobs: 80, useTxt: 'office', kind: 'mixed' });
  assert.equal(mixed.length, 5);
  assert.deepEqual(mixed.slice(0, 4).map(r => r.value), ['50 units', '120 people', '80 jobs', '5,000 m²']);
  assert.equal(mixed[4].html, note, 'the count note, last');
  const spec = fnOf(ov, 'sitePanelSpec');
  assert.match(spec, /const glance = atGlance\(p, o\);/);
  assert.match(spec, /\{ title: 'At a glance', rows: glance, total: glance\.length \}/, 'At a glance: every row shown, no See all');
  assert.doesNotMatch(ov, /function renderVerdictCard\(|Screening summary|ov-confirm|#ov-dev/, 'the card and #ov-dev are gone');
  assert.match(ov, /if \(p\) \{ renderSiteOverview\(p\); return; \}/);
});

test('things to confirm: five rows and the rest in a fold; the next milestone under Timing', () => {
  const spec = fnOf(src('js/overview-tab.js'), 'sitePanelSpec');
  assert.match(spec, /rows: confirm\.slice\(0, 5\)\.map\(c => \(\{ html: `<small class="pnl-r-line">\$\{c\}<\/small>` \}\)\), total: Math\.min\(5, confirm\.length\) \}/);
  assert.match(spec, /confirm\.length > 5 \? \[\{ title: `Every thing to confirm \(\$\{confirm\.length\}\)`/);
  assert.doesNotMatch(spec, /'data-full-table': 'overview'/, 'no See all into the retired card');
  assert.match(spec, /PN\.kv\('Next milestone', esc\(mv\.text\.replace\(\/\^Next milestone: \/, ''\)\)/);
  assert.match(spec, /onMount: \(\) => \{ if \(DT && DT\.fillParts\) DT\.fillParts\(p, \['about'\]\); \}/, 'the Overview fills only About (council items, the FSR link)');
});

test('Open full table widens a panel that is its own full table', () => {
  assert.match(src('js/panel.js'), /an\.classList\.toggle\('ft-pnl', !!\(e && e\.spec && e\.spec\.widen\)\);/);
  const css = src('css/app.css');
  assert.ok(css.includes('#analysis.ft-on.ft-pnl .pnl-host:not([hidden]) { display: block !important; }'));
  assert.ok(css.includes('#analysis.ft-on.ft-pnl .analysis-panes > .f-pane:not(.pnl-host):not(.f-subtabs) { display: none !important; }'));
  assert.match(fnOf(src('js/overview-tab.js'), 'sitePanelSpec'), /\n {6}widen: true,\n/);
  // (presentation mode reads the same panel: the development's name, its answer and four figures)
  assert.match(src('js/area-select.js'), /\$\('#pres-hl'\)\.innerHTML = `<strong>\$\{esc\(p\.title\)\}<\/strong> · \$\{e\.spec\.answer \|\| ''\}`;/);
});

test('devtab parts: About with its why on the Overview, the approvals timeline, the story without About', () => {
  const { DT } = devTab(null);
  const p = stubDev();
  assert.match(DT.partHTML(p, 'timeline'), /^<ol class="stepper compact"><li class="done">/);
  const about = DT.partHTML(p, 'about');
  assert.match(about, /data-info="dev-brief"/);
  assert.match(about, /In review since 2024-03-01/, 'the status with its why (statusOf(p).why)');
  assert.doesNotMatch(DT.partHTML(p, 'story'), /data-info="dev-brief"/, 'About is the Overview\'s');
  // A file opened on its own still says so at the top of its Overview.
  const sub = stubDev({ key: 'Brampton|1 MAIN ST#OZ 24-001', parent: stubDev(), subRef: 'OZ 24-001' });
  assert.match(DT.partHTML(sub, 'about'), /^<div class="sub-head small">[^]*<strong>OZ 24-001<\/strong> on its own:/);
  assert.match(fnOf(src('js/devtab.js'), 'aboutBlockHTML'), /st\.why/);
});

// ---- S6: Records, one view at a development -------------------------------------------------------------
test('Records at a development: one view; the stored sub-tab is not read', () => {
  const dt = src('js/devtab.js'), rt = src('js/records-tab.js');
  assert.doesNotMatch(dt, /peel-dev:devsub|DEVSUBS|function setSub\(|function aboutHTML\(|function siteViewHTML\(|pane-dev-body|data-devsub/);
  assert.match(rt, /if \(root\.DevTab && root\.DevTab\.render\) root\.DevTab\.render\(body\);/);
  assert.match(rt, /title: 'Related applications', rows: rel\.slice\(0, 5\)\.map\(relRow\)/);
  assert.match(rt, /\{ title: 'Files and events', id: 'pnl-hist', open: true,/);
  // (the full view's host is cleared before a file's record or the sources are drawn there)
  assert.ok(rt.indexOf('delete body.dataset.dev;') > rt.indexOf('if (scoped) {') && rt.indexOf('delete body.dataset.dev;') < rt.indexOf("s.rkind === 'file'"));
  assert.doesNotMatch(rt + src('js/analysis-tabs.js'), /syncDevHome/);
  // The full view renders into Records' body (data-dev set), and DevScope's render redraws it only there.
  const p = stubDev(), { DT, body } = devTab(p);
  DT.render();
  assert.equal(body.innerHTML, '', 'no development shown in Records yet: nothing drawn');
  DT.render(body);
  assert.equal(body.dataset.dev, p.key);
  assert.match(body.innerHTML, /id="devtab-hist"[^]*>Files and events<\/h2>/);
  assert.doesNotMatch(body.innerHTML, /data-info="dev-brief"/, 'no About in the full table');
  body.innerHTML = 'stale'; DT.render();
  assert.notEqual(body.innerHTML, 'stale', 'redrawn while it shows a development');
});

test('History is Records\': the header\'s files · history opens Records on the map, its view on a page', () => {
  const rh = fnOf(src('js/devtab.js'), 'revealHistory');
  assert.match(rh, /if \(reachable\(h\)\) return show\(h\);/);
  // (navigation phase 6b: on a page the site's page at Records › Files, the map's tab, as its strip picks it)
  assert.match(rh, /!!\(cur && AT && AT\.openTab && W && W\.openPage\);/);
  assert.match(rh, /AT\.openTab\('records', 'files'\); W\.openPage\('site', \{ keepScroll: true, keep: true \}\);/);
  assert.match(rh, /AT\.openTab\('records', 'files'\)/);
  assert.match(src('js/devtab.js'), /const reachable = x => vis\(x\) \|\| vis\(x && x\.closest\('\.pnl-host, #home'\)\);/);
});

test('the Records panel without the tree (the fallback path): the flat branch, the related list, the files and events', () => {
  const kv = (label, value) => ({ html: `${label} ${value}`, kv: true });
  const p = stubDev({ records: [...stubDev().records, { uid: 'b1', ref: 'BP 24-100', kind: 'permit', phase: 'permit', events: [] }], last: Date.parse('2025-01-02') });
  const q = { key: 'Brampton|3 MAIN ST', title: '3 Main St', units: 40, phase: 'approved' };
  const ctx = {
    PeelUtil: { $: () => null, esc: s => String(s), fmtNum: n => Number(n).toLocaleString('en-CA') },
    PeelPanel: { kv, siteHead: x => ({ name: x.title }), typeWords: t => t },
    PeelPhases: { newestFirst: a => a.slice(), PHASE_BY_KEY: { review: { label: 'In review' }, approved: { label: 'Approved' } }, submittedAt: () => null },
    PeelFileTree: { of: () => null },
    PeelTreeGroups: { siteParts: () => [] },
    PeelDevNav: { relatedProjects: () => [{ q, hits: [{ how: 'overlapping land', m: { ref: 'OZ 24-001' } }] }] },
    DevTab: { partHTML: (x, part) => `<div class="dev-hist">${part}</div>`, fillParts: () => {} },
    PeelApp: { state: { projects: [] } },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/records-tab.js'), ctx);
  const s0 = ctx.PeelRecordsTab.filesPanelSpec(p), s = JSON.parse(JSON.stringify(s0));   // (out of the context's realm)
  assert.match(s.answer, /<strong>1<\/strong> planning file and <strong>1<\/strong> building permit on this site/);
  assert.deepEqual(s.lists.map(l => l.title), ['Files', 'Related applications']);
  const rel = s.lists[1];
  assert.deepEqual(rel.rows[0].attrs, { 'data-pnl-dev': q.key });
  assert.match(rel.rows[0].html, /3 Main St[^]*40<small>homes<\/small>[^]*Approved · overlaps OZ 24-001/);
  assert.deepEqual(rel.seeAll, { 'data-full-table': 'records', 'data-ft-go': 'Related applications' });
  assert.deepEqual(s.folds.map(f => [f.title, f.id, f.open, f.html]), [['Files and events', 'pnl-hist', true, '<div class="dev-hist">story</div>']]);
  assert.equal(typeof s0.onMount, 'function');
});

// ---- S7: Servicing › Network at a development -------------------------------------------------------------
test('Servicing › Network at a development: the four flows, the water supply, one Site fold', () => {
  const net = fnOf(src('js/svc-capacity.js'), 'renderSiteNetwork');
  for (const t of ["'Water, maximum day'", "'Wastewater, average dry weather'", "'Wastewater, peak dry weather'", "'Wastewater, peak wet weather'"]) assert.ok(net.includes(`PN.kv(${t}`), t);
  assert.match(net, /\{ title: 'Flows', rows: flows, total: flows\.length \}/);
  assert.match(net, /\{ title: 'Water: supply route and fire flow', id: 'pnl-water', html: water \}/);
  assert.match(net, /<div class="trace-box">\$\{bRow\('Supply route', `<div id="dev-wtrace" data-info="water-trace">\$\{WT\(\)\.waterTraceHTML\(p\)\}<\/div><div class="wtrace-out"><\/div>`\)\}<\/div>/);
  assert.match(net, /id="dev-fire"/);
  assert.match(net, /id: 'pnl-site', html: DT && DT\.partHTML \? DT\.partHTML\(p, 'site'\) : '' \}/);
  assert.match(net, /const fillSite = \(\) => \{ if \(DT && DT\.fillParts\) DT\.fillParts\(p, \['site'\]\); \};/);
  assert.match(net, /folds: \[\n\s+\{ title: 'Infrastructure coming'[^\n]*\n\s+\{ title: 'Water: supply route and fire flow'[^\n]*\n(?:\s+\/\/[^\n]*\n)*\s+site, alloc,\n/, 'the Site fold and the allocation, after Water');
  assert.equal((net.match(/onMount: fillSite/g) || []).length, 2, 'both specs fill the Site fold (with and without servicing figures)');
  // Fire flow on the Water fold's first open (toggle does not bubble: the capture phase).
  assert.match(src('js/svc-capacity.js'), /document\.addEventListener\('toggle', e => \{\n\s+const d = e\.target; if \(!d \|\| d\.id !== 'pnl-water' \|\| !d\.open\) return;[^]*?root\.PeelSiteContext\.fillFire\(p\);\n\s+\}, true\);/);
  assert.doesNotMatch(src('js/overview-tab.js'), /partHTML\(p, 'site'\)/, 'the Site fold left the Overview');
  // The one Site part: constraints, the aerial check, ground, the mains near, storm sewers and ponds.
  const { DT } = devTab(null), site = DT.partHTML({ ...stubDev(), lat: 43.7, lng: -79.7 }, 'site');
  const ids = [...site.matchAll(/id="(devtab-[\w-]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ['devtab-cx', 'devtab-aerial', 'devtab-ground', 'devtab-net', 'devtab-exist-storm', 'devtab-storm']);
  assert.equal(DT.partHTML({ ...stubDev(), lat: 43.7, lng: -79.7 }, 'ground'), site, "'ground' is the Site part's old name");
  assert.match(DT.partHTML(stubDev(), 'site'), /Not checked: this development has no map location/);
  // The water trace writes its summary into the clicked button's panel or page.
  assert.match(src('js/water-trace.js'), /b\.closest\('#scope-body, \.pnl-host, #home, #water-body'\)/);
});

// ---- S8: Capital at a development, one view ----------------------------------------------------------------
test('Capital is one view at a development: the DC projects it relies on, the EAs and works near it, the DCs it would pay', () => {
  // No chip row at a site (one chip is no row), with or without EAs near; an area keeps its three.
  const tabs = site => {
    const el = () => null, document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener() {} };
    const ctx = { document, setTimeout: () => 0, module: { exports: {} } };
    ctx.window = { PeelUtil: { store: { get: (k, d) => d, set() {} } }, document, DevScope: { current: () => (site ? { key: 'x' } : null) }, PeelCapitalEA: { siteBriefCount: () => (site ? 0 : null) } };
    ctx.globalThis = ctx;
    require('node:vm').runInNewContext(src('js/analysis-tabs.js'), ctx);
    return ctx.module.exports;
  };
  assert.deepEqual([...tabs(true).chipsAt('dca', 'site')], ['timing']);
  assert.deepEqual([...tabs(false).chipsAt('dca', 'area')], ['timing', 'eas', 'projects']);
  assert.equal(tabs(true).subFor('dca', 'eas', true), 'timing');
  // The site's panel (js/dca-tab.js siteTimingSpec, run on stubs).
  const p = { key: 'Brampton|1 MAIN ST', title: '1 Main St' }, brief = { eas: [{}, {}], may: [{}], works: [{}] };
  const near = [{ title: 'Near the site', rows: [] }, { title: 'May apply (not on the map yet)', rows: [] }, { title: 'Capital works planned or under way near the site', rows: [] }];
  const CE = n => ({ siteBriefCount: () => n, siteBriefFor: q => (q === p ? brief : null), easPanelSpec: () => ({ lists: near, method: 'EAs whose mapped study area is within 1 km.', sources: 'Region of Peel EA project pages.' }) });
  const needs = [{ id: 'plant:X', name: 'G.E. Booth', sys: 'ww', status: 'gap', out: 2031, relief: [{ text: 'expansion (2034)' }] }];
  const spec = (ce, scoped = p) => new Function('window', 'MP', 'DV', 'DC', 'SP', 'esc', `${fnOf(src('js/dca-tab.js'), 'siteTimingSpec')}; return siteTimingSpec;`)(
    { PeelPanel: { siteHead: q => ({ title: q.title }), chip: o => `<b>${o.text}</b>` }, PeelCapitalEA: ce },
    () => ({ devNeeds: () => needs }), () => ({ scopedDev: () => scoped }), () => ({ dcRevenueHTML: () => '<div class="dcrev">≈$1.2 M</div>' }), () => ({ hz: { end: 2051 } }), s => String(s));
  const s = spec(CE(4))(p, {}, { pl: 'G.E. Booth' });
  assert.deepEqual(s.lists.map(l => l.title), ['The projects it relies on', ...near.map(l => l.title)]);
  assert.deepEqual(s.figures.map(f => [f.v, f.label, f.ctx]), [[1, 'constraints it relies on', ''], [1, 'run out before relief', ''], [2, 'EAs within 1 km', '1 more may apply'], [1, 'capital works within 1 km', '']]);
  assert.deepEqual(s.folds.map(f => [f.id, f.title, f.html]), [['pnl-dcpay', 'DCs it would pay', '<div class="dcrev">≈$1.2 M</div>']]);
  assert.deepEqual(s.foot.secondary, [{ label: 'Copy for review comments', attrs: { 'data-ce-copy-brief': '' } }]);
  assert.match(s.method, /relieves it \(2026 DC capital maps, draft\)\. EAs whose mapped study area/);
  assert.match(s.sources, /the servicing model\. Region of Peel EA project pages\./);
  assert.match(s.fullTitle, /the DC projects it relies on, the EAs and capital works near it and the DCs it would pay$/);
  // None near: no EA lists, figures or copy action; no location (no servicing facts): no DCs fold.
  const none = spec(CE(0))(p, {}, null);
  assert.deepEqual(none.lists.map(l => l.title), ['The projects it relies on']);
  assert.equal(none.figures.length, 2); assert.deepEqual(none.folds, []); assert.equal(none.foot.secondary, undefined);
  // (another development in scope: its EAs are not borrowed)
  assert.equal(spec(CE(4), { key: 'other' })(p, {}, null).lists.length, 1);
  // The full table: the DC brief, the EA brief, then the site's EA table with its filters, exports and map
  // button (Capital › EAs is no chip at a site), drawn once: the hidden EAs pane is emptied.
  const dca = fnOf(src('js/dca-tab.js'), 'renderDca');
  assert.match(dca, /set\(0, brief \+ \(CE && CE\.siteBriefHTML \? CE\.siteBriefHTML\(p\) : ''\) \+ '<div id="dca-site-eas"><\/div>'\);/);
  assert.match(dca, /if \(CE && CE\.renderEaTab && \$\('#dca-site-eas'\)\) \{ if \(eb\) eb\.innerHTML = ''; CE\.renderEaTab\(\$\('#dca-site-eas'\)\); \}/);
  assert.ok(dca.indexOf("renderEaTab(eb)") < dca.indexOf("renderEaTab($('#dca-site-eas'))"), 'after the EAs pane: the table that answers its controls is the one on screen');
  const cea = src('js/capital-ea.js');
  assert.match(cea, /const EA_HOSTS = '#dca-eas-body, #dca-site-eas';/);
  assert.equal((cea.match(/closest\(EA_HOSTS\)/g) || []).length, 2, 'its filters, sort, CSV, GeoJSON, calendar and map buttons work there');
  assert.doesNotMatch(cea, /closest\('#dca-eas-body'\)/);
  // Show EAs on the map heads the list of the EAs near (a footer has one action besides the table: Copy).
  assert.match(s.lists.find(l => l.title === 'Near the site').tools, /^<button type="button" class="btn small link" data-pnl-ce-map="ea">Show EAs on the map<\/button>$/);
  assert.ok(s.lists.every(l => l.title === 'Near the site' || !l.tools), 'on that list only');
  assert.match(src('js/workspaces.js'), /const MAP_LINK = '[^']*\[data-pnl-ce-map\]';/, 'on a page it opens the full map first');
  // The page's Capital view is the same one panel.
  assert.deepEqual(require('../js/sections.js').VIEWS.site['dca:timing'].keys, ['dca:timing']);
});

// ---- S13: the devtab copies go (M3); one tree renderer in Records (M4) -------------------------------------
test('Records\' full table draws the files with the panel\'s tree; devtab keeps no copy of the derived figures', () => {
  const FT = require('../js/file-tree.js');
  const d = { root: 'A-1', u: 40, n: [['A-1', 1, -1, '', 'h', 1, 40, 0, 'k1'], ['A-2', 2, 0, '', 'h', 1, 0, 0, 'k2'], ['OLD-1', 1, -1, '', 'h', 1, 0, 0, 'k3']], c: [['A-1', 40, 'stated']] };
  const own = FT.treeHTML(d, null, { own: true });
  for (const ref of ['A-1', 'A-2', 'OLD-1']) assert.match(own, new RegExp(`data-dev-file="${ref}"[^]*?<button type="button" class="btn small link tr-own" data-dt-sub="${ref}" title="Open this file on its own: the file and the files under it">on its own</button>`), ref);
  assert.match(own, /<b>40<\/b>homes · counted here/);
  assert.doesNotMatch(FT.treeHTML(d, null, {}), /tr-own|data-dt-sub/, 'off by default: the panel and the page keep their tree');
  const dt = src('js/devtab.js'), files = fnOf(dt, 'filesHTML');
  assert.match(files, /const FT = root\.PeelFileTree, d = FT && !p\.parent \? FT\.of\(p\) : null;/);
  assert.match(files, /FT\.treeHTML\(d, FT\.recLookup\(p\), \{[^}]*own: true, links: true/);
  assert.match(files, /\} else if \(formal\.length > 1[^]*?<ul class="file-tree">\$\{tree\.map\(t => `<li\$\{TG \? TG\.indent\(t\) : ''\}>/, 'the list where there is no tree entry');
  // The one copy of each derived figure: js/dev-detail.js (status), js/dev-nav.js (files, a file on its own, related).
  for (const [name, to] of [['statusOf', 'DD().statusOf(p)'], ['planApprovedNote', 'DD().planApprovedNote(p)'], ['isFormal', 'N().isFormal(r)'], ['isPrecon', 'N().isPrecon(r)'], ['fileTree', 'N().fileTree(p)'], ['relatedProjects', 'N().relatedProjects(p)']]) assert.ok(new RegExp(`const ${name} = [^\\n]*${to.replace(/[().]/g, '\\$&')}`).test(dt), name);
  assert.doesNotMatch(dt, /const STATUS_SIGNALS =|function (statusOf|planApprovedNote|fileTree|subProject|projectByKey|relatedProjects|landShare|landRel|tagAreasLite|devBbox)\(|freshSubs/);
  assert.match(src('js/dev-nav.js'), /isFormal, isPrecon, flyToSite, showDetail \};/);
  // Run: About's status line is the model's statusOf (tests/dev-parity.test.js runs the rest on the real data).
  const { DT, ctx } = devTab(null), p = stubDev();
  assert.ok(DT.partHTML(p, 'about').includes(`<p class="small muted">${ctx.PeelDevDetail.statusOf(p).why}</p>`));
});

// ---- S10: FSR review is the Servicing view svs=fsr, one host ------------------------------------------------
test('the FSR cross-check has one host: Servicing › FSR review (svs=fsr), its panel set beside Network', () => {
  const css = src('css/app.css');
  for (const f of [...JS.map(x => `js/${x}`), 'index.html']) assert.doesNotMatch(src(f), /site-bar-fsr|data-scope-fsr|toggleFor|fsrSpec/, f);
  assert.doesNotMatch(css, /\.site-bar-fsr|\.page-fsr/);
  assert.match(src('index.html'), /data-svcsub="fsr">FSR review<\/button>/);
  const net = fnOf(src('js/svc-capacity.js'), 'renderSiteNetwork');
  assert.match(net, /PN\.set\('svc:network', spec\);\n\s+if \(FC && FC\.panelSpec\) PN\.set\('svc:fsr', FC\.panelSpec\(p, spec\)\);/);
  assert.match(net, /if \(!f\) \{\n[^]*?PN\.set\('svc:network', spec0\);\n\s+if \(FC && FC\.panelSpec\) PN\.set\('svc:fsr', FC\.panelSpec\(p, spec0\)\);\n\s+return;/, 'no units or jobs stated: FSR review still opens (its form says so); run below');
  assert.ok(require('../js/how.js').filesFor('svc:fsr').includes('fsr.json'));
  // The form's fold has its own name (§3.9 retires "FSR cross-check (fold)"); the form's heading is hidden in its box.
  assert.match(src('js/fsr-check.js'), /\{ title: 'The consultant\\u2019s figures against this app\\u2019s', id: 'pnl-fsr', open: true,/);
  assert.match(css, /\.fsr-box \.fsr-check > h3 \{ display: none; \}/);
  // The Review an FSR page shows the same panel: the site's page at Servicing › FSR review (S12; since navigation
  // phase 6b the page host at the development, its view the map's).
  const site = fnOf(src('js/ws-pages.js'), 'site');
  assert.match(site, /SE\.VIEWS\.site\[key\]/);
  assert.match(site, /sec = key === 'overview:' \? s : v \? SE\.specFor\(v, p\) : null/);
  assert.match(site, /folds: waiting \? \[\] : b\.folds, method: waiting \? '' : b\.method, sources: waiting \? '' : b\.sources, onMount: waiting \? null : mount,/);
  for (const f of [site, fnOf(src('js/ws-pages.js'), 'fsr')]) assert.doesNotMatch(f, /COVERAGE|page-fsr|data-pnl-fsrbox/, 'no second copy of the form or the coverage list');
});

// ---- S12: the site page: the map's five tabs by their names; FSR review a Servicing view ---------------------
// (navigation phase 6b: the site's page is the page host at a development, the map's strip and Servicing's views,
// the view the map's tab state names)
// js/sections.js and js/ws-pages.js in a context of their own: the panels stored for one development (the stubs
// below), DevScope's open development, the page ids' labels, the map's tab state (st.view) and its chips.
function sitePages() {
  const vm = require('node:vm'), p = { key: 'k', title: '1 A St', municipality: 'Brampton' }, st = { dev: p, view: 'overview:' };
  const head = { status: { tone: 'stage', text: 'In review' }, badge: '', extra: '', identity: 'OZ 1', tools: { key: 'k' } };
  const row = { attrs: { 'data-pnl-dev': 'k' }, html: 'r' };
  const panels = {
    'overview:': { answer: 'Overview answer', lists: [], folds: [], foot: { primary: { label: 'Servicing memo', attrs: { 'data-pnl-memo': '' } } } },
    'svc:network': { answer: 'Network answer', lists: [{ title: 'The path', rows: [row], total: 1 }], folds: [], foot: { primary: { label: 'Trace the sewer path', attrs: { 'data-trace': 'k' } }, secondary: [{ label: 'Trace water', attrs: { 'data-wtrace': 'k' } }] } },
    'svc:fsr': { answer: 'FSR answer', lists: [{ title: 'The path', rows: [row], total: 1 }], folds: [{ id: 'pnl-fsr', title: 'f', html: '<div class="fsr-box" data-pnl-fsrbox></div>' }], method: 'm',
      foot: { primary: { label: 'Copy the comparison', attrs: { 'data-ws-fsrcopy': '' } }, secondary: [{ label: 'Print / PDF', attrs: { 'data-ws-fsrprint': '' } }] }, onMount: () => {} },
  };
  st.set = new Set(Object.keys(panels));
  const el = () => null, tdoc = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener() {} }, tctx = { document: tdoc, setTimeout: () => 0, module: { exports: {} } };
  tctx.window = { PeelUtil: { store: { get: (k, d) => d, set() {} } }, document: tdoc }; tctx.globalThis = tctx;
  vm.runInNewContext(src('js/analysis-tabs.js'), tctx);
  const T = tctx.module.exports, Wp = require('../js/workspaces.js');
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const window = { document, PeelPanel: { get: k => (st.set.has(k) ? { scope: 'dev:k', spec: { head, ...panels[k] } } : null), scenarioChip: () => '' },
    PeelAnalysisTabs: { TAB_KEYS: T.TAB_KEYS, chipsAt: T.chipsAt, tabReady: () => true, viewKey: () => st.view },
    PeelWorkspaces: { BY_ID: { site: { label: 'Check a site' }, fsr: { label: 'Review an FSR' } }, TAB_NAME: Wp.TAB_NAME, tabPath: Wp.tabPath, chipName: Wp.chipName, hostOf: Wp.hostOf }, PeelApp: { state: { projects: [], filtered: [] } }, DevScope: { current: () => st.dev } };
  const ctx = { window, document, setTimeout: () => 0, clearTimeout() {}, URLSearchParams, CSS: { escape: x => x } }; ctx.globalThis = ctx;
  for (const f of ['js/sections.js', 'js/ws-pages.js']) vm.runInNewContext(src(f), ctx);
  return { WP: window.PeelWsPages, st };
}
const secsOf = (top, label) => { const m = new RegExp(`<nav class="page-secs[^"]*"[^>]* aria-label="${label}"[^>]*>([^]*?)</nav>`).exec(top); return m ? [...m[1].matchAll(/<button[^>]*class="page-sec(?: page-tab)?(?: page-tab-trail)?( on)?"[^>]*>([^<]*)</g)].map(x => `${x[2]}${x[1] ? '*' : ''}`) : null; };
test('the site page: the map\u2019s five tabs by their names; FSR review a Servicing view (the page fsr), each view\u2019s own footer first', () => {
  const { WP, st } = sitePages(), plain = x => JSON.parse(JSON.stringify(x));
  let m = WP.host('site');
  assert.deepEqual(secsOf(m.tabs, 'Tabs'), ['Overview*', 'Growth', 'Servicing', 'Capital', 'Records']);
  assert.equal(secsOf(m.tabs, 'Views'), null, 'the views row only on Servicing');
  assert.equal(m.id, 'site'); assert.equal(m.eyebrow, 'Overview · Brampton', 'the view and the place, the tabs\u2019 words');
  assert.equal(m.answer, 'Overview answer');
  assert.deepEqual(plain(m.actions.map(a => a.label)), ['Servicing memo', 'Open the map', 'Another site'], 'Inquiry draft, ☆ Watch and Check FSR are the header\u2019s');
  // Servicing: its row, Network on (the map's chips at a development), its own footer first (§5 row 56).
  st.view = 'svc:network'; m = WP.host('site');
  assert.deepEqual(secsOf(m.tabs, 'Tabs'), ['Overview', 'Growth', 'Servicing*', 'Capital', 'Records']);
  assert.deepEqual(secsOf(m.tabs, 'Views'), ['Network*', 'FSR review']);
  assert.match(m.tabs, /<nav class="page-secs page-subsecs" aria-label="Views" data-psec="views"><button type="button" class="page-sec on" data-pg-tab="svc" data-pg-sub="network" aria-pressed="true">Network<\/button><button type="button" class="page-sec" data-pg-tab="svc" data-pg-sub="fsr" aria-pressed="false">FSR review<\/button><\/nav>$/);
  assert.equal(m.answer, 'Network answer'); assert.equal(m.eyebrow, 'Servicing › Network · Brampton');
  assert.deepEqual(plain(m.actions), [{ label: 'Trace the sewer path', attrs: { 'data-trace': 'k' }, primary: true }, { label: 'Trace water', attrs: { 'data-wtrace': 'k' } }, { label: 'Open the map', attrs: { 'data-ws-go': 'site', 'data-ws-keep': '' } }, { label: 'Another site', attrs: { 'data-ws-unpick': 'site' } }]);
  // Servicing › FSR review: Review an FSR, its id, its panel, its footer; the stepper is the Find step's only (§5 row 57).
  st.view = 'svc:fsr'; m = WP.host('site');
  assert.equal(m.id, 'fsr'); assert.match(m.eyebrow, /^Servicing › FSR review · Brampton$/); assert.doesNotMatch(m.eyebrow, /pnl-steps-i|Find ›/);
  assert.deepEqual(secsOf(m.tabs, 'Tabs'), ['Overview', 'Growth', 'Servicing*', 'Capital', 'Records']);
  assert.deepEqual(secsOf(m.tabs, 'Views'), ['Network', 'FSR review*']);
  assert.equal(m.answer, 'FSR answer'); assert.equal(m.folds[0].id, 'pnl-fsr'); assert.equal(typeof m.onMount, 'function');
  assert.deepEqual(plain(m.lists[0].rows[0].attrs), { 'data-ws-go': 'fsr', 'data-ws-dev': 'k', 'data-ws-keep': '' }, 'a row: the map view at this view');
  assert.deepEqual(plain(m.actions.slice(0, 4)), [{ label: 'Copy the comparison', attrs: { 'data-ws-fsrcopy': '' }, primary: true }, { label: 'Print / PDF', attrs: { 'data-ws-fsrprint': '' } }, { label: 'Open the map', attrs: { 'data-ws-go': 'fsr', 'data-ws-keep': '' } }, { label: 'Another site', attrs: { 'data-ws-unpick': 'fsr' } }]);
  assert.ok(m.tools && m.tools.key === 'k', 'the one header');
  assert.deepEqual(plain(WP.build('fsr').actions.map(a => a.label)), ['Copy the comparison', 'Print / PDF', 'Open the map', 'Another site'], 'the page fsr with a site: the same view');
  // Its panel not set yet: the strip and the row, the page says it is loading (and tries again).
  st.set.delete('svc:fsr'); m = WP.host('site');
  assert.deepEqual(secsOf(m.tabs, 'Views'), ['Network', 'FSR review*']);
  assert.match(m.answer, /Loading Servicing › FSR review for 1 A St/); assert.equal(m.onMount, null); assert.equal(m.pending, true);
  assert.equal(m.name, '1 A St', 'under its own header');
  // No site: the Find step (phase 1's, with the FSR-posted list); Check a site's too.
  st.dev = null; m = WP.build('fsr');
  assert.equal(m.id, 'fsr'); assert.match(m.answer, /^Find the development/);
  assert.equal(WP.build('site').id, 'site'); assert.match(WP.build('site').answer, /^Find the development/);
  const ws = src('js/ws-pages.js');
  assert.match(fnOf(ws, 'fsr'), /if \(!devNow\(\)\) return find\('fsr'\);\n {4}return site\(\);/);
  assert.match(fnOf(ws, 'site'), /const key = hostKey\('site'\), id = key === 'svc:fsr' \? 'fsr' : 'site';/);
  assert.doesNotMatch(ws + src('css/app.css'), /pnl-steps-i|function viewsBar/, 'the stepper on a site\u2019s page and the old views row are gone');
  // A phone: the row scrolls sideways like the bar (a .page-secs), lighter, under it.
  const css = src('css/app.css');
  assert.match(css, /\.page-secs \+ \.page-subsecs \{ margin-top: calc\(-1 \* var\(--space-2\)\); border-bottom: 0; \}/);
  // The Records section's Files and events (chunk 2) at 390 px: the Gantt's bars are its own, not the development
  // table's 40 px pills (a shared class), so an open file at the track's end no longer widens the page (398 → 390).
  assert.match(css, /\n\.gt \.gt-bar \{ display: flex; flex: 0 1 120px; min-width: 40px;/);
  assert.doesNotMatch(css, /\n\.gt-bar \{ display: flex/);
  assert.match(css, /\n\.gt-bar \{ position: absolute; top: 2px; bottom: 2px; background: var\(--c\);/);
});

// ---- S11: one header on every tab and on the page; the site bar goes ----------------------------------------
test('one header on every tab and on the page: tools, actions, ⋯, ☆ Watch and the flags; the site bar is gone', () => {
  // Every development panel's head is PN.siteHead(p), which carries the tools.
  for (const [f, n] of [['js/overview-tab.js', 1], ['js/growth-ui.js', 2], ['js/svc-capacity.js', 2], ['js/dca-tab.js', 1], ['js/capital-ea.js', 1], ['js/records-tab.js', 2]]) assert.equal((src(f).match(/PN\.siteHead\(p\)/g) || []).length, n, f);
  const PN = require('../js/panel.js'), p = { key: 'k', title: '1 A St', municipality: 'Brampton', phase: 'review', records: [], lat: 43.7, lng: -79.7 };
  const h = PN.siteHead(p), panel = PN.html({ key: 'overview:', head: h, answer: 'a' }), head = panel.slice(0, panel.indexOf('</header>'));
  assert.equal(h.tools.tools.length, 5);
  for (const re of [/<div class="pnl-flags chips">/, /data-watch="k"/, /<div class="pnl-tools-row"[^>]*>/, /data-at="svc:fsr"/, /<details class="site-more pnl-more">/]) assert.match(head, re, 'in the sticky header');
  // On a page the same rows, under the title (js/ws-pages.js pageHTML), Check FSR opening the page's FSR review.
  const WP = require('../js/ws-pages.js');
  globalThis.PeelPanel = PN;
  try {
    const pg = WP.pageHTML({ id: 'site', name: '1 A St', tools: h.tools, answer: 'a' }, ''), ph = pg.slice(pg.indexOf('<header class="home-h"'), pg.indexOf('</header>'));
    assert.match(ph, /<button type="button" class="btn small" data-ws-page="fsr" title="Servicing › FSR review/);
    assert.ok(ph.includes('data-watch="k"') && !ph.includes('data-at="svc:fsr"'));
  } finally { delete globalThis.PeelPanel; }
  assert.equal((src('js/ws-pages.js').match(/tools: s\.head\.tools/g) || []).length, 1, 'the site page, Review an FSR its Servicing view (S12)');
  // A page's Trace water and Compare open the full map first, as Trace sewer does.
  assert.match(src('js/workspaces.js'), /const MAP_LINK = '[^']*\[data-trace\], \[data-wtrace\], \[data-scope-compare\]/);
  // No site bar anywhere.
  for (const f of [...JS.map(x => `js/${x}`), 'index.html', 'css/app.css']) assert.doesNotMatch(src(f), /#site-bar|id="site-bar"|renderSiteBar|data-scope-close|data-memo"|\[data-memo\]|site-tools/, f);
  // Each tab's panel carries its own copy of the header: sync puts its live parts right (☆, traces, flags).
  const pj = src('js/panel.js'), st = fnOf(pj, 'syncTools');
  assert.match(pj, /if \(ok\) syncTools\(host\);/);
  for (const re of [/ST\.TRACE \? ST\.TRACE\.key/, /ST\.WTRACE \? ST\.WTRACE\.key/, /DS\.flagsFor\(p\)/, /A\.watch\.has\(b\.dataset\.watch\)/]) assert.match(st, re);
  assert.match(src('js/workspaces.js'), /if \(PN\(\) && PN\(\)\.syncTools\) PN\(\)\.syncTools\(el\);/, 'and on a page, once drawn');
  // ☆ Watch (no .btn) and the ⋯ items (links) are a thumb tall on a touch screen.
  assert.match(src('css/app.css'), /@media \(max-width: 700px\), \(pointer: coarse\) \{[^]*?\.pnl-flags \.watch-btn, \.pnl-more \.site-more-menu \.btn \{ min-height: 44px; \}[^]*?\n\}/);
  // A phone: the header (trail, name, chips, identity, flags, tools) is taller than the half sheet, so a
  // development's scrolls with its panel (R7's fallback; measured 364–458 px of 423); ⋯ opened low scrolls into view.
  assert.match(panel, /^<article class="pnl pnl-site" data-panel="overview:">/);
  assert.match(PN.html({ key: 'overview:', head: { name: 'Peel' }, answer: 'a' }), /^<article class="pnl" data-panel="overview:">/, 'an area panel keeps its sticky header');
  assert.match(src('css/app.css'), /@media \(max-width: 700px\) \{\n {2}\.unofficial-banner[^]*?\.pnl\.pnl-site > \.pnl-head \{ position: static; \}\n\}/);
  assert.match(pj, /if \(!d \|\| !d\.open \|\| !d\.classList \|\| !d\.classList\.contains\('pnl-more'\)\) return;[^\n]*\n[^\n]*m\.scrollIntoView\(\{ block: 'nearest' \}\)/);
  // What the bar's hidden facts said is the Overview's: its figures and the Water (zone) and Wastewater (plant) rows.
  const sp = fnOf(src('js/overview-tab.js'), 'sitePanelSpec');
  assert.match(sp, /svcRow\(`💧 Water\$\{f && f\.z \?/); assert.match(sp, /svcRow\(`🚰 Wastewater\$\{plant \? ` · to \$\{esc\(plant\)\}` : ''\}`/);
});

test('a stored panel’s header is put right when it is shown: ☆ Watch, the trace buttons, the flags', () => {
  const vm = require('node:vm'), w = {};
  const el = (ds, html) => { const c = new Set(); return { dataset: ds, innerHTML: html || '', textContent: '', attrs: {}, classList: { contains: k => c.has(k), toggle: (k, on) => (on ? c.add(k) : c.delete(k)) }, setAttribute(k, v) { this.attrs[k] = v; } }; };
  const watch = el({ watch: 'k' }), tr = el({ trace: 'k' }, 'Trace sewer'), wt = el({ wtrace: 'k' }, 'Trace water'), fl = { innerHTML: '' };
  const host = { querySelector: s => (s === '.pnl-flags .pnl-flag-list' ? fl : null), querySelectorAll: s => ({ '.pnl-flags [data-watch]': [watch], '[data-trace]': [tr], '[data-wtrace]': [wt] }[s] || []) };
  Object.assign(w, { PeelApp: { watch: new Set(['k']) }, PeelSewerTrace: { TRACE: { key: 'k' }, WTRACE: { key: null } }, DevScope: { current: () => ({ key: 'k' }), flagsFor: () => '<span class="chip">Stalled</span>' } });
  vm.runInNewContext(src('js/panel.js'), { window: w });
  const PN = w.PeelPanel;
  PN.syncTools(host);
  assert.ok(watch.classList.contains('on')); assert.equal(watch.textContent, '★ Watching'); assert.equal(watch.attrs['aria-pressed'], 'true');
  assert.equal(tr.dataset.on, '1'); assert.equal(tr.innerHTML, 'Hide the path', 'a second press hides the path (js/sewer-trace.js reads data-on)');
  assert.ok(!wt.dataset.on); assert.equal(wt.innerHTML, 'Trace water');
  assert.equal(fl.innerHTML, '<span class="chip">Stalled</span>', 'the flags as they are now');
  // The trace cleared and the star taken off elsewhere: the copy follows.
  w.PeelSewerTrace.TRACE.key = null; w.PeelApp.watch.clear();
  PN.syncTools(host);
  assert.equal(tr.dataset.on, ''); assert.equal(tr.innerHTML, 'Trace sewer'); assert.equal(watch.textContent, '☆ Watch'); assert.equal(watch.attrs['aria-pressed'], 'false');
});

// ---- Review fixes (navigation phase 5) -------------------------------------------------------------------
// js/svc-capacity.js renderSiteNetwork in a context of its own: the panels it stores, the Site part's mount.
function siteNetwork(facts, extra = {}) {
  const sets = {}, filled = [];
  const window = { PeelSvcData: { svcFacts: () => facts, PLANT_SHORT: { Lakeview: 'G.E. Booth' } }, PeelFsrCheck: require('../js/fsr-check.js'),
    PeelPanel: { set: (k, v) => { sets[k] = v; }, siteHead: q => ({ name: q.title }), kv: (l, v, t) => ({ html: `${l}|${v}${t ? `|${t}` : ''}`, kv: true }) },
    DevTab: { partHTML: (q, part) => `<div class="brief" id="part-${part}"></div>`, fillParts: (q, parts) => filled.push(parts) },
    PeelDemandUI: { allocBoxHTML: () => '<form class="alloc"></form>' }, PeelDemand: { toMLd: v => v * 0.0864 }, PeelDevDetail: { psName: a => a.name }, ...extra };
  const ctx = { window, module: { exports: {} } }; ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/svc-capacity.js'), ctx);
  return { SC: ctx.module.exports, sets, filled };
}
const plain = x => JSON.parse(JSON.stringify(x));   // (out of the context's realm)
test('no units or jobs stated: Servicing › Network still holds the Site checks (their one home); FSR review opens, its form saying so', () => {
  const { SC, sets, filled } = siteNetwork(null), p = { key: 'Brampton|5085 MAYFIELD RD~SPA-2024-0010', title: '5085 Mayfield Rd' };
  SC.renderSiteNetwork(p);
  const net = plain(sets['svc:network']), fsr = plain(sets['svc:fsr']);
  assert.ok(net, 'a Network panel: the Site fold has a home for every development (4,562 have no units or jobs)');
  assert.equal(net.answer, 'No servicing figures for this development: no units or jobs are stated.');
  assert.deepEqual(net.folds.map(f => [f.id, f.html]), [['pnl-site', '<div class="brief" id="part-site"></div>'], ['pnl-alloc', '<form class="alloc"></form>']]);
  assert.equal(net.figures, undefined); assert.equal(net.lists, undefined); assert.equal(net.calc, undefined);
  sets['svc:network'].onMount(); assert.deepEqual(plain(filled), [['site']], 'its mount fills the constraints, aerial check, ground, mains near, storm sewers and ponds');
  assert.equal(fsr.answer, net.answer);
  assert.deepEqual(fsr.folds.map(f => f.id), ['pnl-fsr', 'pnl-fsr-cover'], 'FSR review: the form and what an FSR should cover');
  assert.deepEqual([fsr.figures, fsr.lists], [[], []]);
  assert.match(fsr.method, /^What the FSR should cover:/);
});

test('Servicing › Network’s path: the zone, the pumping stations, discharges to the outlet (how it was set, Review →), the plant', () => {
  const f = { cb: { water: { maxDay: 5.65 }, wastewater: { avg: 3.37, peak: 12.8, wetPeak: 13.1, infiltration: 0 } }, z: { id: 'pz:1', name: 'Pressure zone 1' }, zMax: 100, zNear: false,
    sps: [{ a: { name: 'Lakeshore SPS' }, wet: 50, firm: 100 }], pl: 'Lakeview', cap: true, reserve: 50.6, use: 0.5, path: [{}] };
  const DO = mode => ({ recordOf: () => (mode ? { mode } : null), queue: () => ({ all: [{ p: { key: 'k' } }] }) });
  const path = (extra) => { const { SC, sets } = siteNetwork(f, extra); SC.renderSiteNetwork({ key: 'k', title: '800 Hydro Rd' }); return plain(sets['svc:network'].lists.find(l => l.title === 'The path').rows.map(r => r.html)); };
  const rows = path({ PeelDevOutlets: DO(null) });
  assert.deepEqual(rows.map(r => r.split('|')[0]), ['💧 Pressure zone 1', 'Lakeshore SPS', 'Discharges to', '→ G.E. Booth'], 'the outlet before the plant (design §3.6)');
  assert.equal(rows[2], 'Discharges to|the outlet · Automatic', 'no Review → until the DC impact model is worked out (never built from here)');
  assert.equal(path({ PeelDevOutlets: DO('confirmed') })[2], 'Discharges to|the outlet · Confirmed');
  assert.match(path({ PeelDevOutlets: DO('set'), PeelDcImpact: { current: () => ({}) } })[2], /^Discharges to\|the outlet · Set by hand <button type="button" class="btn small link" data-ws-page="outlets" data-dvo="pick-dev" data-dvo-key="k">Review →<\/button>$/, 'Review → opens Review outlets at this development, when its queue lists it');
  assert.doesNotMatch(path({ PeelDevOutlets: { recordOf: () => null, queue: () => ({ all: [] }) }, PeelDcImpact: { current: () => ({}) } })[2], /Review/, 'not queued: no Review →');
});

test('Records’ full table: each file with the link that put it there (rule, confidence, overlap); the panel’s tree stays compact', () => {
  const FT = require('../js/file-tree.js'), rules = ['same land: use + draft plan', 'pre-consultation → the formal file it overlaps most'];
  const d = { root: 'A-1', u: 40, n: [['A-1', 1, -1, 0, 'h', 0.98, 40, 0, 'k1'], ['PRE-1', 5, 0, 1, 'l', 1, 0, 0, 'k2'], ['A-2', 2, 0, -1, 'm', null, 0, 0, 'k3'], ['OLD-1', 1, -1, 0, 'm', 0.5, 0, 0, 'k4'], ['OLD-2', 2, -1, -1, '', null, 0, 0, 'k5']], c: [['A-1', 40, 'stated']] };
  const links = h => [...h.matchAll(/data-dev-file="([^"]+)"[^]*?(?=data-dev-file=|<p class="tr-key")/g)].map(m => [m[1], (/<span class="tr-why tr-link">([^<]*)<\/span>/.exec(m[0]) || [])[1] || null]).filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i);
  assert.deepEqual(links(FT.treeHTML(d, null, { own: true, links: true, rules })), [
    ['A-1', 'same land: use + draft plan · high confidence, 98% inside'],
    ['PRE-1', 'pre-consultation → the formal file it overlaps most · low confidence, 100% inside'],
    ['A-2', 'medium confidence'],
    ['OLD-1', 'same land: use + draft plan · medium confidence, 50% inside'],   // (the earlier files on the same land carry theirs too)
    ['OLD-2', null],   // (on its land with no rule: no link to show)
  ]);
  assert.doesNotMatch(FT.treeHTML(d, null, { own: true, rules }), /tr-link|(high|medium) confidence|% inside/, 'off by default: the panel and the page keep their tree');
});

test('the header’s “n links to check” flag: Records › Files on the map, the site’s page at Records › Files', () => {
  const vm = require('node:vm'), calls = [];
  let page = false, click = null;
  const document = { addEventListener: (t, f) => { if (t === 'click') click = f; }, documentElement: { classList: { contains: k => k === 'home-on' && page } } };
  const window = { document, DevScope: { current: () => ({ key: 'Mississauga|5080' }) }, PeelWorkspaces: { openPage: (...a) => calls.push(['openPage', ...a]) }, PeelAnalysisTabs: { openTab: (...a) => calls.push(['openTab', ...a]) } };
  vm.runInNewContext(src('js/file-tree.js'), { window, document });
  const flag = { target: { closest: s => (s === '[data-tree-check]' ? {} : null) } };
  click(flag);
  assert.deepEqual(plain(calls), [['openTab', 'records', 'files']], 'the map: Records › Files');
  calls.length = 0; page = true; click(flag);
  assert.deepEqual(plain(calls), [['openTab', 'records', 'files'], ['openPage', 'site', { keepScroll: true, keep: true }]], 'a page: the site’s page at Records › Files, the map’s tab (navigation phase 6b: one tab state)');
  calls.length = 0; click({ target: { closest: () => null } });
  assert.deepEqual(calls, [], 'any other click: nothing');
});

test('← Whole development in Records’ full table: back from a file opened on its own (the scope itself, no drill)', () => {
  const whole = stubDev(), sub = stubDev({ key: `${whole.key}#OZ 24-001`, parent: whole, subRef: 'OZ 24-001' });
  const { ctx, on } = devTab(sub), shown = [];
  ctx.PeelDevNav.showDetail = q => shown.push(q.key);
  const back = { closest: s => (s === '[data-dt-back]' || s === '.dev-hist, .pnl-fold, .home-main' ? {} : null) };
  for (const f of on.click) f({ target: back, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(shown, [whole.key], 'the whole development is the scope again');
});

test('Check FSR opens the form in view: the map’s panel and the page scroll to its fold (design §3.6: the cross-check first)', () => {
  assert.match(src('js/analysis-tabs.js'), /showFootTab\(tab, sub\); Sh\(\)\.viewLink\.write\(\);\n[^\n]*\n\s+if \(a\.dataset\.at === 'svc:fsr'\) requestAnimationFrame\(\(\) => \{ const f = document\.querySelector\('#pnl-svc #pnl-fsr'\); if \(f\) \{ f\.open = true; f\.scrollIntoView\(\{ block: 'start' \}\); \} \}\);/);
  const op = fnOf(src('js/workspaces.js'), 'openPage');
  assert.match(op, /if \(!o\.keepScroll\) \{ const el = \$\('#home'\); if \(el\) el\.scrollTop = 0; \}\n[^\n]*\n\s+if \(dev && w\.id === 'fsr' && !o\.keepScroll\) \{ const f = \$\('#home #pnl-fsr'\); if \(f\) \{ f\.open = true; f\.scrollIntoView\(\{ block: 'start' \}\); \} \}/, 'after the page’s scroll reset (the id asked for: openPage maps it to the site’s page, navigation phase 6b)');
  assert.match(op, /else if \(w\) \{ const sub = dev \? w\.siteSub : w\.sub;/, 'FSR review behind the page at a site (tests/workspaces.test.js runs it)');
});
