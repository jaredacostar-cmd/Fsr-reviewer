'use strict';
// Stage 2 — four tabs, Servicing combined. The brief's tests:
//   1. the tab and sub-view inventory per scope matches the spec;
//   2. Servicing › Capacity has both systems in one table with a basis on every row;
//   3. no tab shows more than 4 sub-views;
//   4. old links map to the new tabs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = src('index.html');
const plain = o => JSON.parse(JSON.stringify(o));

// js/analysis-tabs.js in a vm: labs = the Labs switches on; site = a development is the scope.
function loadTabs({ labs = [], site = false, publicView = false, siteEas = 3 } = {}) {
  const el = () => null, store = { get: (k, d) => d, set: () => {} };
  const document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener: () => {} };
  const window = { PeelUtil: { store, isPublic: () => publicView }, document,
    PeelLabs: { on: id => labs.includes(id) },
    DevScope: { current: () => (site ? { key: 'x' } : null) },
    PeelCapitalEA: { siteBriefCount: () => (site ? siteEas : null) } };
  const ctx = { window, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}

// The spec's inventory: the chips each tab shows at each scope.
const SPEC = {
  area: { overview: [], growth: ['pipeline', 'areas', 'timing'], svc: ['capacity', 'network'], dca: ['timing', 'eas', 'projects'], records: ['sources', 'checks'] },
  site: { overview: [], growth: ['pipeline'], svc: ['network', 'fsr'], dca: ['timing'], records: ['files'] },
};

test('1. tabs: Overview · Growth · Servicing · Capital at every scope, then Records as a small trailing tab', () => {
  const tabs = [...HTML.matchAll(/role="tab" class="f-tab( f-tab-trail)?" id="ftab-(\w+)"[^>]*>([^<]+)</g)].map(m => [m[2], m[3], !!m[1]]);
  assert.deepEqual(tabs, [['overview', 'Overview', false], ['growth', 'Growth', false], ['svc', 'Servicing', false], ['dca', 'Capital', false], ['records', 'Records', true]]);
  assert.deepEqual(plain(loadTabs().TAB_KEYS), ['overview', 'growth', 'svc', 'dca', 'records']);
  // Records is right-aligned and muted; since bundle 6 it is not in the Settings gear too.
  assert.match(src('css/app.css'), /\.f-tab\.f-tab-trail \{ margin-left: auto; font-size: var\(--fs-1\); color: var\(--text-muted\);/);
  assert.doesNotMatch(src('js/topbar.js'), /data-tbg="records"/);
});

test('1. sub-views per scope match the spec (Peel / area and a development)', () => {
  for (const [scope, tabs] of Object.entries(SPEC)) {
    const AT = loadTabs({ site: scope === 'site' });
    for (const [tab, want] of Object.entries(tabs)) assert.deepEqual(plain(AT.chipsAt(tab, scope)), want, `${scope} › ${tab}`);
  }
  // Labs › DC funding adds no chip: its screen is a fold of Capital › DC timing (js/dc-projects.js).
  assert.deepEqual(plain(loadTabs({ labs: ['funding'] }).chipsAt('dca', 'area')), ['timing', 'eas', 'projects']);
  assert.deepEqual(plain(loadTabs({ labs: ['funding'], site: true }).chipsAt('dca', 'site')), ['timing']);
  assert.deepEqual(plain(loadTabs({ labs: ['funding'], publicView: true }).chipsAt('dca', 'area')), ['timing', 'eas', 'projects']);
  // EAs never show a chip at a site: the one Capital view lists them (navigation phase 5), with or without any near.
  assert.deepEqual(plain(loadTabs({ site: true, siteEas: 3 }).chipsAt('dca', 'site')), ['timing']);
  assert.deepEqual(plain(loadTabs({ site: true, siteEas: 0 }).chipsAt('dca', 'site')), ['timing']);
  // One chip is no choice: the row is hidden (Overview has none at all).
  assert.match(src('js/analysis-tabs.js'), /p\.hidden = pk !== key \|\| chipsAt\(pk, scopeOf\(pk\)\)\.length < 2;/);
  assert.ok(!/class="f-pane f-subtabs"[^>]*data-pane="overview"/.test(HTML), 'Overview has no sub-views');
  // The chip rows in index.html: one per tab, in the spec's order and words.
  const row = tab => { const i = HTML.indexOf(`f-subtabs`, HTML.indexOf(`data-pane="${tab}" hidden role="group"`) - 80); const s = HTML.slice(i, HTML.indexOf('</div>', i)); return [...s.matchAll(/data-(?:gsub|svcsub|dcasub|rsub)="(\w+)">([^<]+)</g)].map(m => m[2].trim()); };
  // (no two sub-views share a name: design bundle 2)
  assert.deepEqual(row('growth'), ['Pipeline', 'Areas', 'Forecast']);
  assert.deepEqual(row('svc'), ['Capacity', 'Network', 'FSR review']);
  assert.deepEqual(row('dca'), ['DC timing', 'EAs', 'Projects']);
  assert.deepEqual(row('records'), ['Sources', 'Data checks', 'Files']);
});

test('1. the panes behind each sub-view: Areas is one drill-down; Network holds blocks, stations, zones and the water facilities', () => {
  const pane = id => (HTML.match(new RegExp(`id="${id}" data-pane="(\\w+)" data-sub="([\\w ]+)"`)) || []).slice(1).join('/');
  assert.equal(pane('pane-growth-byplan'), 'growth/areas');
  assert.equal(pane('pane-growth-census'), 'growth/areas');
  assert.equal(pane('pane-svc-capacity'), 'svc/capacity');
  for (const id of ['pane-ww', 'pane-pumpstations', 'pane-water']) assert.equal(pane(id), 'svc/network', id);
  // Navigation phase 2: Allocations is a fold of Capacity (its tables in Capacity's full table); the
  // water facilities and the hydraulic check are Network's; the servicing model is Records › Data checks.
  assert.equal(pane('pane-alloc'), 'svc/capacity');
  for (const id of ['pane-wfac', 'pane-hydro']) assert.equal(pane(id), 'svc/network', id);
  assert.equal(pane('pane-svc-checks'), 'records/checks');
  // Navigation phase 3: the Ledger is Forecast's By period fold; its pane (id kept) is in Forecast's full table.
  for (const id of ['pane-growth-timing', 'pane-growth-ledger']) assert.equal(pane(id), 'growth/timing', id);
  assert.equal(pane('pane-dca-build'), 'dca/projects');
  // Navigation phase 4: DC projects is DC timing; its list in full, the screening results and funding levels are DC timing's.
  for (const id of ['pane-dca-timing', 'pane-dca-dcproj', 'pane-dca-rec', 'pane-dca-funding']) assert.equal(pane(id), 'dca/timing', id);
  // The funding screen is "Screening results" now.
  assert.match(src('js/dca-tab.js'), /<h3 class="sub-title">Screening results/);
  // The lens (owner decision 9): its map preset and the one System control; Capital, Water and Wastewater
  // still open their tab, and the comment says so (AD-9).
  assert.match(src('js/topbar.js'), /encoding and legend, and the one System control \(js\/analysis-tabs\.js setSys\) to what its map/);
  assert.doesNotMatch(src('js/topbar.js'), /it never changes the right panel's tabs/);
});

test('2. Servicing › Capacity: water and wastewater in ONE table, a basis on every row', () => {
  const s = src('js/svc-capacity.js');
  // Every row the collector adds names its basis (one of the three).
  const coll = s.slice(s.indexOf('function collect()'), s.indexOf('\n  }\n', s.indexOf('function collect()')));
  const pushes = coll.match(/rows\.push\(\{/g).length;
  assert.equal((coll.match(/rows\.push\(\{[^]*?basis: (wwB|'metered'|'design'|'mp')/g) || []).length, pushes, 'a basis on every row');
  for (const kind of ["kind: 'plant'", "kind: 'wplant'", "kind: 'pump'", "kind: 'storage'", "kind: 'ps'", "kind: 'pipe'"]) assert.ok(coll.includes(kind), kind);
  // Rendered: one table, both systems, data-basis on every row, the spec's columns.
  const U = { esc: x => String(x), fmtNum: n => Math.round(n).toLocaleString('en-CA'), fmt1: n => n.toFixed(1), capTxt: v => `${Math.round(v * 1000)} m³/d`,
    roomWords: (v, u, f) => (v < 0 ? `over by ${f(-v)}` : `room ${f(v)}`), basisChip: b => `<span class="basis" data-basis="${b}">${b}</span>`, hlP: h => `<p>${h}</p>`, BASIS_KEYS: ['metered', 'design', 'mp'] };
  const window = { PeelUtil: U, PeelSvcTab: { optSwitch: () => '<div class="svc-switch"></div>' }, PeelMapMarkers: { THIS_YEAR: 2026 }, PeelSvcPlants: { hz: { end: 2051, aStart: 2026, aYears: 5, pStart: 2028, pYears: 10 } } };
  const ctx = { window, module: { exports: {} } }; ctx.globalThis = ctx;
  vm.runInNewContext(s, ctx);
  const C = ctx.module.exports;
  const hz = { end: 2051, at: [[2031, 70], [2041, 85], [2051, 95]], c80: 2035, c90: 2048, c100: null };
  const rows = [
    { id: 'plant:Lakeview', sys: 'ww', kind: 'plant', name: 'G.E. Booth', sub: 'plant', compared: 'Flow vs rated', basis: 'metered', unit: 'ML/d', cap: 518, capWord: 'rated', existing: 400, built: 0, committed: 480, buildout: 620, limit: { y: 2028, what: '90% trigger' }, horizon: hz },
    { id: 'wsys:southPeel', sys: 'water', kind: 'wplant', name: 'South Peel', sub: 'treatment', compared: 'Max day vs rated', basis: 'metered', unit: 'ML/d', cap: 1700, capWord: 'rated', existing: 900, built: 0, committed: 1000, buildout: 1100, limit: { y: null, what: '90% trigger' }, horizon: hz },
    { id: 'stor:x', sys: 'water', kind: 'storage', name: 'X Reservoir', sub: 'storage', compared: 'Required vs available', basis: 'mp', unit: 'ML', cap: 40, capWord: 'available', existing: 34, built: 0, committed: 34, buildout: 49, limit: { y: 2029, what: 'required > available' }, horizon: hz },
    { id: 'ps:y', sys: 'ww', kind: 'ps', name: 'Y', sub: 'pumping station', compared: 'Peak wet vs firm', basis: 'design', unit: 'L/s', cap: 800, capWord: 'firm', existing: 436, built: 0, committed: 437, buildout: 441, limit: { y: null, what: '100% firm' }, horizon: hz },
  ].map(C.derive);
  const html = C.tableHTML(rows);
  assert.equal((html.match(/<table class="dt svc-table cap-all"/g) || []).length, 1, 'one table');
  const trs = html.match(/<tr class="cap-row[^"]*" data-basis="(\w+)"/g);
  assert.equal(trs.length, rows.length);
  for (const t of trs) assert.match(t, /data-basis="(metered|design|mp)"/);
  assert.match(html, /<td class="c-sys" data-l="System">Wastewater<\/td>/); assert.match(html, /<td class="c-sys" data-l="System">💧 Water<\/td>/);
  const head = html.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/)[1];
  const th = [...head.matchAll(/<th( class="[^"]*")?>([^<]+)/g)].map(m => [m[2].trim(), /xc/.test(m[1] || '')]);
  assert.deepEqual(th.filter(x => !x[1]).map(x => x[0]), ['Facility', 'System', 'Compared', 'Committed', 'Build-out', 'Limit year', 'Room / over']);
  assert.deepEqual(th.filter(x => x[1]).map(x => x[0]), ['Capacity', 'Today', 'Committed', 'Build-out'], 'Engineering columns');
  // Room / over in signed words; the limit year as a year, "now" or "after <end>".
  assert.match(html, /over by 102\.0 ML\/d/); assert.match(html, /room 600\.0 ML\/d/);
  assert.match(html, /≈2028<small>90% trigger/); assert.match(html, /after 2051<small>90% trigger/);
  // One sort vocabulary (N-11): the panel's words, Soonest · Largest impact; each button names its measure.
  assert.match(html, /data-cap-sort="limit"[^>]*>Soonest</); assert.match(html, /data-cap-sort="impact"[^>]*>Largest impact</);
  assert.match(html, /data-cap-sort="limit"[^>]*title="The soonest limit year first"/);
  assert.doesNotMatch(html, />Limit year<\/button>|>Impact<\/button>/);
  // Sort by limit year (soonest first) or by impact (most loaded at build-out first).
  assert.deepEqual(C.sortRows(rows, 'limit', 2026).map(r => r.id), ['plant:Lakeview', 'stor:x', 'wsys:southPeel', 'ps:y']);
  // (Stage 3: impact in the Master Plan's own test, how far build-out goes past each limit.)
  assert.deepEqual(C.sortRows(rows, 'impact', 2026).map(r => r.id), ['plant:Lakeview', 'stor:x', 'wsys:southPeel', 'ps:y']);
  // The horizon table (2031 / 2041 / 2051; reaches 80 / 90 / 100%) folds under each row.
  assert.match(s, /\$\{open \? `<tr class="cap-hz"><td colspan="11">\$\{horizonHTML\(r\)\}<\/td><\/tr>` : ''\}/);
  assert.match(s, /<th class="n">Reaches 80%<\/th><th class="n">Reaches 90%<\/th><th class="n">Reaches 100%<\/th>/);
  // One stacked bar per row, with the 90% and 100% marks; the Simple / Engineering column switch.
  assert.match(s, /rated: r\.cap, trigger: 0\.9 \* r\.cap/);
  assert.match(s, /SvcTab\(\)\.optSwitch\('tech', 'Columns', \[\['off', 'Simple'\], \['on', 'Engineering'\]\]\)/);
  assert.ok(/<th class="n xc">Capacity<\/th>/.test(html), 'engineering columns (.xc) behind the switch');
});

test('2. the Simple / Engineering switch is on every Servicing sub-view', () => {
  assert.match(src('js/svc-tab.js'), /\$\('#water-body'\)\.innerHTML = `\$\{SCREEN_NOTE\}<div class="svc-head">\$\{svcLegend\(Y\)\}<div class="svc-switches">\$\{optSwitch\('tech'/);
  assert.match(src('js/svc-tab.js'), /\$\('#ww-body'\)\.innerHTML = `\$\{SCREEN_NOTE\}<div class="svc-head">\$\{svcLegend\(Y\)\}<div class="svc-switches">\$\{optSwitch\('tech'/);
  assert.match(src('js/svc-capacity.js'), /el\.innerHTML = `\$\{U\.SCREEN_NOTE \|\| ''\}<div class="svc-head"><div class="svc-switches">\$\{SvcTab\(\)\.optSwitch\('tech'/, 'Checks');
  assert.match(src('js/svc-tab.js'), /'#svc-capacity-body', '#svc-checks-body'/, 'the switch handler covers the new bodies');
});

test('3. no tab shows more than 4 sub-views, at any scope, with every Labs switch on', () => {
  const all = ['hydro', 'funding', '3d', 'timebox', 'swmm', 'batch', 'gravity', 'sewer', 'pressure'];
  for (const site of [false, true]) {
    const AT = loadTabs({ labs: all, site });
    for (const tab of Object.keys(SPEC.area)) assert.ok(AT.chipsAt(tab, site ? 'site' : 'area').length <= 4, `${tab}${site ? ' (site)' : ''}`);
  }
  for (const [tab, s] of Object.entries(loadTabs().TABSUBS)) assert.ok(s.valid.length <= 4, tab);
  for (const row of HTML.matchAll(/<div class="f-pane f-subtabs[^"]*" data-pane="\w+"[^>]*>([\s\S]*?)<\/div>/g)) assert.ok((row[1].match(/<button/g) || []).length <= 4, row[0].slice(0, 80));
  // Labs: the extra tools sit behind Settings › Labs.
  const L = require('../js/labs.js');
  assert.deepEqual(plain(L.IDS), all);
  const css = src('css/app.css');
  for (const g of ['html:not(.lab-3d) .view3d-ctl', 'html:not(.lab-timebox) .tool-rail [data-tool="timebox"]', 'html:not(.lab-swmm) [data-tbx="swmm"]', 'html:not(.lab-batch) [data-ptool-act="batch"]', 'html:not(.lab-hydro) .lab-hydro', 'html:not(.lab-funding) .lab-funding-pane']) assert.ok(css.includes(g), g);
  assert.match(src('js/topbar.js'), /data-tbg="labs">Labs<\/button>/);
});

test('4. old links and stored views map to the new tabs', () => {
  const AT = loadTabs();
  const m = (t, sub) => plain(AT.migrateTabKey(t, sub));
  const cases = [
    [['ww', 'plants'], { tab: 'svc', svcSub: 'capacity' }], [['ww', 'catchments'], { tab: 'svc', svcSub: 'network' }], [['ww', 'alloc'], { tab: 'svc', svcSub: 'capacity' }], [['ww', 'pumpstations'], { tab: 'svc', svcSub: 'network' }],
    [['water', 'capacity'], { tab: 'svc', svcSub: 'capacity' }], [['water', 'zones'], { tab: 'svc', svcSub: 'network' }], [['water', 'facilities'], { tab: 'svc', svcSub: 'network' }], [['water', 'hydro'], { tab: 'svc', svcSub: 'network' }],
    [['growth', 'census2051'], { tab: 'growth', gSub: 'areas' }], [['growth', 'byplan'], { tab: 'growth', gSub: 'areas' }], [['growth', 'timing'], { tab: 'growth', gSub: 'timing' }], [['growth', 'ledger'], { tab: 'growth', gSub: 'timing' }], [['census'], { tab: 'growth', gSub: 'areas' }],
    [['dca', 'build'], { tab: 'dca', dcSub: 'projects' }], [['dca', 'dcproj'], { tab: 'dca', dcSub: 'timing' }], [['dca', 'recommendations'], { tab: 'dca', dcSub: 'timing' }], [['dca', 'funding'], { tab: 'dca', dcSub: 'timing' }], [['dca', 'eas'], { tab: 'dca', dcSub: 'eas' }],
    [['plants'], { tab: 'svc', svcSub: 'capacity' }], [['demand'], { tab: 'growth' }], [['criteria'], { tab: 'overview' }], [['developments'], { tab: 'overview' }], [['records'], { tab: 'records' }],
  ];
  for (const [[t, sub], want] of cases) assert.deepEqual(m(t, sub), want, `t=${t}${sub ? ` / ${sub}` : ''}`);
  // The share link reads the old sub-view param for the old tab, and turns on the Labs switch an old
  // funding-screen or hydraulic-check link needs; new links carry svs / rs.
  const sh = src('js/share.js');
  assert.match(sh, /const oldSub = pageWs \? pageWs\.sub : t === 'ww' \|\| t === 'water' \? q\.get\('ws'\) : t === 'growth' \? q\.get\('gs'\) : t === 'dca' \? q\.get\('dcs'\) : t === 'svc' \? q\.get\('svs'\) : t === 'records' \? q\.get\('rs'\) : null;/);
  assert.match(sh, /if \(window\.PeelLabs && \(m\.dcSub === 'funding' \|\| q\.get\('dcs'\) === 'funding'\)\) window\.PeelLabs\.set\('funding', true\);/);
  assert.match(sh, /if \(window\.PeelLabs && q\.get\('t'\) === 'water' && q\.get\('ws'\) === 'hydro'\) window\.PeelLabs\.set\('hydro', true\);/);
  assert.match(sh, /if \(tab === 'svc'\) set\('svs', AT\(\)\.getSvcSub\(\)\); if \(tab === 'records'\) set\('rs', AT\(\)\.getRSub\(\)\);/);
  // In-app callers with an old name still land: setSub maps it, showFootTab('ww' | 'water') is Servicing.
  assert.match(src('js/analysis-tabs.js'), /const setSub = \(tab, sub\) => \{ const r = migrateSub\(tab, sub\) \|\| \{ tab, sub \}, s = TABSUBS\[r\.tab\];/);
  assert.equal(AT.setSub('dca', 'build'), 'dca'); assert.equal(AT.getDcSub(), 'projects', "setSub maps an old name ('build' → 'projects')");
  assert.equal(AT.tabOf('ww'), 'svc'); assert.equal(AT.tabOf('water'), 'svc');
});

test('removed: the heatmap and the gas / hydro layers', () => {
  const LG = src('js/layer-groups.js'), MM = src('js/map-markers.js'), CX = src('js/constraints.js');
  assert.doesNotMatch(LG, /\['heat',|\['gas',|\['hydro',/);
  assert.match(MM, /show: \{ markers: 'Markers' \},/);
  assert.doesNotMatch(MM, /heat-canvas|const heat = /);
  assert.doesNotMatch(CX, /\b(gas|hydro): \{ label/);
  assert.doesNotMatch(src('css/app.css'), /heat-canvas|--heat-ramp|--cx-gas|--cx-hydro/);
});

test('every panel keeps the screening note', () => {
  // Stage 3: the Capacity panel is a standard panel, whose footer carries the note (js/panel.js);
  // its full table keeps the note too.
  assert.match(src('js/svc-capacity.js'), /el\.innerHTML = `\$\{U\.SCREEN_NOTE \|\| ''\}\$\{fullTableHTML\(rows\)\}`;/);
  assert.match(src('js/svc-capacity.js'), /root\.PeelPanel\.set\('svc:capacity', panelSpec\(rows\)\)/);
  assert.match(src('js/panel.js'), /<p class="pnl-note small">\$\{NOTE\}\$\{reportLink\(s\.key, h\.name\)\}<\/p><\/footer>/);
  assert.match(src('js/labs.js'), /General screening results only\. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results\./);
});

test('a development: Growth is its units and how the site compares (other applications with homes)', () => {
  const s = src('js/growth-ui.js');
  const siteCompare = new Function(`${s.match(/function siteCompare\(v, others\) \{[\s\S]*?\n  \}/)[0]}; return siteCompare;`)();
  assert.deepEqual(siteCompare(10, [1, 5, 20, 30]), { n: 4, pctLarger: 50, median: 12.5 });
  assert.deepEqual(siteCompare(100, [1, 5, 20]), { n: 3, pctLarger: 100, median: 5 });
  assert.equal(siteCompare(0, [1]), null); assert.equal(siteCompare(5, []), null);
  // Permit-only houses are not "developments" to compare a site with.
  assert.match(s, /const hasApp = q => \(q\.records \|\| \[\]\)\.some\(r => r\.kind === 'application'\);/);
});

test('Servicing › Network: blocks, stations and zones, with "What loads this?" and "Show upstream"', () => {
  assert.match(HTML, /id="pane-svc-netbar" data-pane="svc" data-sub="network"/);
  const s = src('js/svc-capacity.js');
  assert.match(s, /data-net-loads\$\{dis\} title="The developments loading it, as a scope">What loads this\?<\/button>/);
  assert.match(s, />Show upstream<\/button>/);
  assert.match(s, /if \(e\.target\.closest\('\[data-net-loads\]'\)\) \{ if \(root\.PeelToolScope\) root\.PeelToolScope\.showLoads\(id\); return; \}/);
  assert.match(s, /if \(e\.target\.closest\('\[data-net-up\]'\)\) ST\.focusSvc\(id, \{ zoom: true, loads: false, keep: true \}\);/);
  // A row tap selects it (on the map, with everything upstream) and stays on Network.
  assert.match(src('js/dca-tab.js'), /const netPick = id => \{ ST\(\)\.focusSvc\(id, \{ loads: false \}\);/);
});
