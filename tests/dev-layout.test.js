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
  const body = { dataset: {}, innerHTML: '' };
  const document = { getElementById: id => (id === 'records-body' ? body : null), querySelectorAll: () => [], addEventListener() {}, documentElement: { classList: { contains: () => false } } };
  const ctx = { document, PeelPhases: require('../js/phases.js'), PeelUtil: require('../js/util.js'), PeelDemand: require('../js/demand.js'), PeelMapCore: { map: {} }, DevScope: { current: () => scoped }, console };
  ctx.window = ctx; ctx.globalThis = ctx;
  for (const f of ['js/devtab.js', 'js/dev-detail.js', 'js/dev-nav.js']) require('node:vm').runInNewContext(src(f), ctx);
  return { DT: ctx.DevTab, body, ctx };
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

test('History is Records\': the header\'s files · history opens Records on the map, its section on a page', () => {
  const rh = fnOf(src('js/devtab.js'), 'revealHistory');
  assert.match(rh, /if \(reachable\(h\)\) return show\(h\);/);
  assert.match(rh, /WP\.siteAt\(cur\.key, 'files'\); W\.openPage\('site', \{ keepScroll: true \}\);/);
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
  assert.match(net, /onMount: \(\) => \{ if \(DT && DT\.fillParts\) DT\.fillParts\(p, \['site'\]\); \}/);
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
  // The full table: the DC brief, then the EA brief (Capital › EAs is no chip at a site).
  assert.match(src('js/dca-tab.js'), /set\(0, brief \+ \(CE && CE\.siteBriefHTML \? CE\.siteBriefHTML\(p\) : ''\)\);/);
  // The page's Capital section is the same one panel.
  assert.deepEqual(require('../js/sections.js').BY_ID.capital.keys, ['dca:timing']);
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
  assert.match(files, /FT\.treeHTML\(d, FT\.recLookup\(p\), \{[^}]*own: true/);
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
  assert.match(net, /if \(!f\) \{ if \(FC && FC\.panelSpec\) PN\.set\('svc:fsr', FC\.panelSpec\(p, \{ head: PN\.siteHead\(p\),/, 'no units or jobs stated: FSR review still opens (its form says so)');
  assert.ok(require('../js/how.js').filesFor('svc:fsr').includes('fsr.json'));
  // The form's fold has its own name (§3.9 retires "FSR cross-check (fold)"); the form's heading is hidden in its box.
  assert.match(src('js/fsr-check.js'), /\{ title: 'The consultant\\u2019s figures against this app\\u2019s', id: 'pnl-fsr', open: true,/);
  assert.match(css, /\.fsr-box \.fsr-check > h3 \{ display: none; \}/);
  // The Review an FSR page shows the same panel: the site's page at Servicing › FSR review (S12).
  const site = fnOf(src('js/ws-pages.js'), 'site');
  assert.match(site, /SE\.viewOf\('servicing', 'fsr'\)/);
  assert.match(site, /const sec = fv \? SE\.specFor\(vw, p\)/);
  assert.match(site, /folds: waiting \? \[\] : b\.folds, method: waiting \? '' : b\.method, sources: waiting \? '' : b\.sources, onMount: waiting \? null : mount,/);
  for (const f of [site, fnOf(src('js/ws-pages.js'), 'fsr')]) assert.doesNotMatch(f, /COVERAGE|page-fsr|data-pnl-fsrbox/, 'no second copy of the form or the coverage list');
});

// ---- S12: the site page: the map's five tabs by their names; FSR review a Servicing view ---------------------
// js/sections.js and js/ws-pages.js in a context of their own: the panels stored for one development (the stubs
// below), DevScope's open development, the page ids' labels.
function sitePages() {
  const vm = require('node:vm'), p = { key: 'k', title: '1 A St', municipality: 'Brampton' }, st = { dev: p };
  const head = { status: { tone: 'stage', text: 'In review' }, badge: '', extra: '', identity: 'OZ 1', tools: { key: 'k' } };
  const row = { attrs: { 'data-pnl-dev': 'k' }, html: 'r' };
  const panels = {
    'overview:': { answer: 'Overview answer', lists: [], folds: [] },
    'svc:network': { answer: 'Network answer', lists: [{ title: 'The path', rows: [row], total: 1 }], folds: [] },
    'svc:fsr': { answer: 'FSR answer', lists: [{ title: 'The path', rows: [row], total: 1 }], folds: [{ id: 'pnl-fsr', title: 'f', html: '<div class="fsr-box" data-pnl-fsrbox></div>' }], method: 'm',
      foot: { primary: { label: 'Copy the comparison', attrs: { 'data-ws-fsrcopy': '' } }, secondary: [{ label: 'Print / PDF', attrs: { 'data-ws-fsrprint': '' } }] }, onMount: () => {} },
  };
  st.set = new Set(Object.keys(panels));
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const window = { document, PeelPanel: { get: k => (st.set.has(k) ? { scope: 'dev:k', spec: { head, ...panels[k] } } : null), scenarioChip: () => '' },
    PeelWorkspaces: { BY_ID: { site: { label: 'Check a site' }, fsr: { label: 'Review an FSR' } } }, PeelApp: { state: { projects: [], filtered: [] } }, DevScope: { current: () => st.dev } };
  const ctx = { window, document, setTimeout: () => 0, clearTimeout() {}, URLSearchParams, CSS: { escape: x => x } }; ctx.globalThis = ctx;
  for (const f of ['js/sections.js', 'js/ws-pages.js']) vm.runInNewContext(src(f), ctx);
  return { WP: window.PeelWsPages, st };
}
const secsOf = (top, label) => { const m = new RegExp(`<nav class="page-secs[^"]*" aria-label="${label}"[^>]*>([^]*?)</nav>`).exec(top); return m ? [...m[1].matchAll(/<button[^>]*class="page-sec( on)?"[^>]*>([^<]*)</g)].map(x => `${x[2]}${x[1] ? '*' : ''}`) : null; };
test('the site page: the map\u2019s five tabs by their names; FSR review a Servicing view (the page fsr)', () => {
  const { WP, st } = sitePages(), plain = x => JSON.parse(JSON.stringify(x));
  WP.siteAt('k', 'summary');
  let m = WP.build('site');
  assert.deepEqual(secsOf(m.top, 'Sections'), ['Overview*', 'Growth', 'Servicing', 'Capital', 'Records']);
  assert.equal(secsOf(m.top, 'Views'), null, 'the views row only on Servicing');
  assert.deepEqual(plain(m.actions.map(a => a.label)), ['Servicing memo', 'Open the map', 'Another site'], 'Inquiry draft, ☆ Watch and Check FSR are the header\u2019s');
  // Servicing: its row, Network on (the section), FSR review the page fsr.
  WP.siteAt('k', 'servicing'); m = WP.build('site');
  assert.deepEqual(secsOf(m.top, 'Views'), ['Network*', 'FSR review']);
  assert.match(m.top, /<nav class="page-secs page-subsecs" aria-label="Views" data-psec="views"><button type="button" class="page-sec on" data-ws-sec="servicing" aria-pressed="true">Network<\/button><button type="button" class="page-sec" data-ws-page="fsr" aria-pressed="false">FSR review<\/button><\/nav>$/);
  assert.equal(m.answer, 'Network answer');
  // The page fsr with a site: the site's page at Servicing › FSR review, its id, its panel, its footer.
  m = WP.build('fsr');
  assert.equal(m.id, 'fsr'); assert.match(m.eyebrow, /^Review an FSR · .*Output: notes for the review/);
  assert.deepEqual(secsOf(m.top, 'Sections'), ['Overview', 'Growth', 'Servicing*', 'Capital', 'Records']);
  assert.deepEqual(secsOf(m.top, 'Views'), ['Network', 'FSR review*']);
  assert.equal(m.answer, 'FSR answer'); assert.equal(m.folds[0].id, 'pnl-fsr'); assert.equal(typeof m.onMount, 'function');
  assert.deepEqual(plain(m.lists[0].rows[0].attrs), { 'data-ws-go': 'fsr', 'data-ws-dev': 'k' });
  assert.deepEqual(plain(m.actions), [{ label: 'Copy the comparison', attrs: { 'data-ws-fsrcopy': '' }, primary: true }, { label: 'Print / PDF', attrs: { 'data-ws-fsrprint': '' } }, { label: 'Open the map', attrs: { 'data-ws-go': 'fsr' } }, { label: 'Another site', attrs: { 'data-ws-unpick': 'fsr' } }]);
  assert.ok(m.tools && m.tools.key === 'k', 'the one header');
  // Its panel not set yet: the bar and the row, the page says it is loading.
  st.set.delete('svc:fsr'); m = WP.build('fsr');
  assert.deepEqual(secsOf(m.top, 'Views'), ['Network', 'FSR review*']);
  assert.match(m.answer, /Loading FSR review for 1 A St/); assert.equal(m.onMount, null);
  // No site: the Find step (phase 1's, with the FSR-posted list).
  st.dev = null; m = WP.build('fsr');
  assert.equal(m.id, 'fsr'); assert.match(m.answer, /^Find the development/);
  const ws = src('js/ws-pages.js');
  assert.match(fnOf(ws, 'fsr'), /if \(!devNow\(\)\) return find\('fsr'\);\n {4}return site\('fsr'\);/);
  assert.match(fnOf(ws, 'site'), /const SE = root\.PeelSections, fv = view === 'fsr' && !!SE, id = fv \? 'fsr' : 'site';/);
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
