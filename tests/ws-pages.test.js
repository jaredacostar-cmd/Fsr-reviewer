'use strict';
// Stage 4b — workspace pages in Home's layout (js/ws-pages.js): the template, and the figures the pages
// derive from numbers the app already has (uncommitted reserve, the Old pipes grid, approved-not-built).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
const WP = (() => { const ctx = { module: { exports: {} } }; ctx.globalThis = ctx; vm.runInNewContext(src('js/ws-pages.js'), ctx); return ctx.module.exports; })();
const NOTE = "General screening results only. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results.";

test('the page template: Home’s layout, sections in order, empty ones left out', () => {
  const m = {
    id: 'tight', eyebrow: 'Servicing capacity · Peel', name: 'Can the system take it?', status: { tone: 'over', text: '9 over' }, identity: 'Peel · 32 facilities', scen: '<button>Scenario</button>',
    answer: '9 of 32 facilities are over capacity at build-out.', caveats: [{ text: '1 data source is due for a refresh.', at: 'records:sources' }],
    figures: [1, 2, 3, 4, 5].map(i => ({ v: i, u: 'u', label: `figure ${i}` })), chart: '<svg></svg>',
    lists: [{ title: 'Soonest limits', rows: [1, 2, 3, 4, 5, 6].map(i => ({ html: `row ${i}`, attrs: { 'data-ws-go': 'tight' } })), total: 6, see: { 'data-ws-go': 'tight' } }, { title: 'Second', rows: [{ html: 'x' }], total: 1 }],
    map: { svg: '<svg class="m"></svg>', attrs: { 'data-ws-go': 'tight' }, caption: 'Over and tight' },
    folds: [{ title: 'More', html: 'more' }], method: 'method', sources: 'sources',
    actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'tight' }, primary: true }, { label: 'Briefing PDF', attrs: { 'data-pnl-brief': '' } }],
  };
  const h = WP.pageHTML(m, NOTE);
  // (every list and fold in the column beside the map, then the map)
  assert.deepEqual(plain(WP.sectionsOf(h)), ['header', 'scenario', 'answer', 'caveat', 'figures', 'chart', 'list', 'list', 'fold', 'map', 'method', 'sources', 'footer']);
  assert.equal((h.match(/class="pnl-fig[ "]/g) || []).length, 4, 'at most four figures');
  assert.equal((h.match(/<li class="pnl-row/g) || []).length, 6, 'five rows of the first list, one of the second');
  assert.match(h, /<h3>Soonest limits<\/h3><button type="button" class="btn small link" data-ws-go="tight">See all \(6\) →<\/button>/);
  // The lists sit beside the map (Home's two columns); the map opens the workspace's map view.
  assert.match(h, /<div class="home-cols"><div class="home-col-main"><section class="pnl-list page-list" data-psec="list">[\s\S]*?<section class="home-map" data-psec="map">[\s\S]*?<button type="button" class="home-map-btn" data-ws-go="tight"/);
  assert.match(h, /⚠ 1 data source is due for a refresh\. <button type="button" class="btn small link" data-ws-full data-at="records:sources">Review →<\/button>/);
  assert.match(h, /<footer class="page-foot" data-psec="footer"><div class="pnl-acts"><button type="button" class="btn small pnl-primary" data-ws-go="tight">Open the map<\/button><button type="button" class="btn small pnl-sec" data-pnl-brief="">Briefing PDF<\/button><\/div><p class="pnl-note small">General screening results only/);
  // A bare page: header, answer and footer (with the screening note).
  const bare = WP.pageHTML({ id: 'x', name: 'x', answer: 'Loading…' }, NOTE);
  assert.deepEqual(plain(WP.sectionsOf(bare)), ['header', 'answer', 'footer']);
  assert.ok(bare.includes(NOTE));
  // A map whose drawing is not ready still links to the map.
  assert.match(WP.pageHTML({ id: 'x', name: 'x', map: { svg: '', attrs: { 'data-ws-go': 'x' } } }, NOTE), /class="home-map-btn" data-ws-go="x" aria-label="Open the map"><span class="home-map-empty small muted">Open the map<\/span>/);
});

test('uncommitted reserve (D-5-1): treatment plants only, in ML/d and people; pumping and storage as limits', () => {
  const crit = { wastewater: { avg: 290 }, water: { avg: 270, maxDay: 1.8 } };
  const rows = [
    { id: 'plant:Lakeview', ss: 'plant:Lakeview', kind: 'plant', name: 'G.E. Booth', unit: 'ML/d', cap: 518, committed: 489, pctCom: 94.4, pctBo: 120 },
    { id: 'plant:Clarkson', kind: 'plant', name: 'Clarkson', unit: 'ML/d', cap: 350, committed: 230, pctCom: 66, pctBo: 84 },
    { id: 'wsys:southPeel', kind: 'wplant', name: 'South Peel water treatment', unit: 'ML/d', cap: 1700, committed: 900, pctCom: 53, pctBo: 67 },
    { id: 'ps:dr:A', kind: 'ps', name: 'McVean Drive', unit: 'L/s', cap: 1400, committed: 2343, pctCom: 167, pctBo: 180 },
    { id: 'ps:dr:B', kind: 'ps', name: 'Gore Road', unit: 'L/s', cap: 81, committed: 32, pctCom: 39, pctBo: 131 },
    { id: 'ps:dr:C', kind: 'ps', name: 'Quiet', unit: 'L/s', cap: 100, committed: 50, pctCom: 50, pctBo: 60 },
    { id: 'stor:West Brampton Reservoir', kind: 'storage', name: 'West Brampton Reservoir', unit: 'ML', cap: 40, committed: 34, pctCom: 85, pctBo: 123 },
    { id: 'pump:Zone 6', kind: 'pump', name: 'Into zone 6 and above', unit: 'ML/d', cap: 100, committed: 80, pctCom: 80, pctBo: 95 },
  ];
  const psPlant = { 'ps:dr:A': 'Lakeview', 'ps:dr:B': 'Clarkson', 'ps:dr:C': 'Lakeview' };
  const res = WP.reserveRows(rows, crit, psPlant);
  assert.deepEqual(plain(res.map(r => r.id)), ['plant:Lakeview', 'plant:Clarkson', 'wsys:southPeel'], 'plants only, least reserve (as a share) first');
  const booth = res[0];
  assert.equal(booth.reserve, 29, 'rated 518 − committed 489');
  assert.equal(Math.round(booth.people), 100000, '29 ML/d at 290 L per person per day');
  assert.deepEqual(plain(booth.limits.map(l => [l.name, l.when])), [['McVean Drive', 'now']], 'its own pumping stations over their limit (now: committed ≥ 100%)');
  assert.deepEqual(plain(res[1].limits.map(l => [l.name, l.when])), [['Gore Road', 'at build-out']]);
  const sp = res[2];
  assert.equal(Math.round(sp.people), Math.round(800e6 / 486), 'water treatment at the maximum day per person (270 × 1.8)');
  assert.deepEqual(plain(sp.limits.map(l => l.name)), ['West Brampton Reservoir'], 'the lake-based storage and zone pumping over their limit');
  // The page shows them, and says where the rule comes from.
  const s = src('js/ws-pages.js');
  assert.match(s, /title: 'Uncommitted reserve at the treatment plants'/);
  assert.match(s, /Uncommitted reserve \(Ontario MECP Procedure D-5-1, treatment plants only\)/);
  assert.match(s, /label: 'no relief in time'/);
  assert.match(s, /late = rows\.filter\(r => r\.relief === 'gap' && r\.limit\.y != null\)/);
  // 'gap' is split on the page and in the rows: a relief after the limit, or none listed.
  assert.match(src('js/svc-capacity.js'), /const reliefOf = r => \(r\.relief === 'gap' && !r\.reliefY \? \['No relief listed', 'over'\]/);
});

test('Old pipes grid: likelihood by age (moderate risk one band up) × consequence by units carried', () => {
  const run = (age, risky, units, lengthM = 1000) => ({ age, risky, units, lengthM });
  assert.equal(WP.likeOf(run(55, false, 100)), 1); assert.equal(WP.likeOf(run(70, false, 100)), 2); assert.equal(WP.likeOf(run(85, false, 100)), 3);
  assert.equal(WP.likeOf(run(55, true, 100)), 2, 'moderate risk: one band up'); assert.equal(WP.likeOf(run(85, true, 100)), 3, 'capped at the top band');
  assert.equal(WP.likeOf(run(20, true, 100)), 1, 'listed for risk alone: band 1'); assert.equal(WP.likeOf(run(null, true, 100)), 1);
  assert.equal(WP.consOf(run(60, false, 999)), 1); assert.equal(WP.consOf(run(60, false, 1000)), 2); assert.equal(WP.consOf(run(60, false, 10000)), 3);
  const g = WP.pipeGrid([run(85, false, 96437, 2500), run(70, true, 20000), run(55, false, 150), run(55, false, 150, 500)]);
  assert.deepEqual(plain(g.map(row => row.map(c => c.n))), [[2, 0, 0], [0, 0, 0], [0, 0, 2]]);
  assert.equal(g[2][2].km, 3.5); assert.equal(g[0][0].km, 1.5);
  assert.deepEqual(plain(WP.LIKE.slice(1)), ['50–64 years', '65–79 years', '80+ years']);
  assert.deepEqual(plain(WP.CONS.slice(1)), ['100–1,000 units', '1,000–10,000 units', '10,000+ units']);
});

test('approved, not yet built: units left in files past their first planning approval', () => {
  const rank = { inception: 0, review: 1, approved: 2, permit: 3, construction: 4, completed: 5, cancelled: -1 };
  const ps = [['review', 500], ['approved', 300], ['permit', 120], ['construction', 80], ['completed', 0], ['approved', 0], ['cancelled', 999]].map(([phase, left]) => ({ phase, left }));
  assert.deepEqual(plain(WP.approvedNotBuilt(ps, p => p.left, p => rank[p.phase])), { units: 500, n: 3 });
});

test('Review an FSR coverage: what an FSR covers and what the app can check', () => {
  assert.deepEqual(plain(WP.COVERAGE.map(c => c[1])), ['app', 'app', 'app', 'app', 'part', 'eye', 'eye']);
  assert.match(WP.COVERAGE[6][0], /Fire flow/);
  assert.match(src('js/ws-pages.js'), /Functional Servicing Report Requirements \(November 2009\); confirm the current version with the Region\./);
});

test('every workspace has a page builder; pages open from Home, chips and the map view', () => {
  const s = src('js/ws-pages.js'), w = src('js/workspaces.js');
  assert.match(s, /const BUILD = \{ home, tight, site, growth, outlook, coming, projects, eaflow, week, fsr, pipes, study, sewer, guides, roles, approvals, flows, network, capacity, fsrguide, capital, targets, forecast, glossary, help, data \};/, "every workspace, Labs › Sewer designer, and the Reference pages: How it works and its guides, the Glossary and Help");
  // A page's map buttons open the workspace's map view; Full map is the all-tools map; the map view has
  // a way back to the page.
  assert.match(w, /const pg = e\.target\.closest\('\[data-ws-page\]'\);\s*if \(pg\) \{ e\.preventDefault\(\); menuOpen = false; openPage\(pg\.dataset\.wsPage\); return; \}/);
  assert.match(src('index.html'), /data-ws-backpage title="Back to this workspace's page">← Page<\/button>/);
  // Study area: the map itself moves onto the page and back.
  assert.match(w, /function placeMap\(\) \{\s*const m = \$\('#map'\), slot = \$\('#page-map-slot'\);/);
  assert.match(s, /<div class="page-map-slot" id="page-map-slot"><\/div>/);
  // While a page is open the panel slots stay empty (no element id twice on screen).
  assert.match(src('js/panel.js'), /if \(Wp && Wp\.mode && Wp\.mode\(\) === 'home'\) \{ document\.querySelectorAll\('\.pnl-host'\)/);
  // Servicing capacity is the renamed Getting tight.
  assert.match(w, /\{ id: 'tight', label: 'Servicing capacity'/);
  assert.doesNotMatch(s + w, /Getting tight/);
});

test('Growth: the pipeline by stage, the commitment ladder in order, then built since 2021', () => {
  const LY = require('../js/layers.js');
  assert.deepEqual(plain(WP.STAGES.map(s => s[1])), ['Pre-application', 'In review', 'Zoning approved', 'Plan approved', 'Servicing permit', 'Building permit', 'Under construction', 'Built since 2021']);
  assert.deepEqual(plain(WP.STAGES.slice(0, -1).map(s => s[0])), plain(LY.LADDER.map(r => r.key)), 'the ladder’s rungs, one set of names');
  assert.deepEqual(plain(WP.COMMITTED_STAGES), plain(LY.COMMITTED_RUNGS));
  const R = (rungs, o = {}) => ({ rungs: { early: 0, review: 0, zoning: 0, plan: 0, servicing: 0, building: 0, construction: 0, ...rungs }, built: 0, existing: 0, estimated: 0, left: Object.values(rungs).reduce((t, v) => t + v, 0), ...o });
  const L = { a: R({ early: 100 }), b: R({ review: 400 }), z: R({ zoning: 60 }), c: R({ plan: 170, building: 130 }), d: R({ servicing: 50 }), e: R({}, { built: 30, existing: 10 }), x: null };
  const st = WP.stageRows(Object.keys(L), k => L[k]);
  assert.deepEqual(plain(st.rows.map(r => [r.key, r.units])), [['early', 100], ['review', 400], ['zoning', 60], ['plan', 170], ['servicing', 50], ['building', 130], ['construction', 0], ['built', 30]]);
  assert.equal(st.total, 940, 'the census (existing) part of a site is not in the pipeline');
  assert.equal(st.committed, 180, 'committed: Servicing permit and up');
  const h = WP.stageChartHTML(st, 1880);
  assert.deepEqual([...h.matchAll(/<span class="stg-l" role="cell">([^<]+)</g)].map(m => m[1]), plain(WP.STAGES.map(s => s[1])));
  assert.match(h, /<i class="stg-fill ly-proposed" style="width:100\.0%"><\/i><\/span><b class="stg-v" role="cell">400<\/b><span class="stg-p muted" role="cell">43%<\/span>/, 'scaled to the largest stage, labelled directly');
  assert.match(h, /940 dwellings in the pipeline would add about <strong>50%<\/strong> to the 1,880 dwellings on the system \(2021 census\)/);
  assert.match(h, /<strong>180<\/strong> committed \(Servicing permit and up: the Peel rule\)/);
  assert.match(src('js/ws-pages.js'), /chart: stage \? stageChartHTML\(stage, census\) : pl\.chart,/);
  // Every stage has a colour, the same on the chart, the table and the treemap.
  assert.deepEqual(plain(Object.keys(WP.STAGE_CLS)), plain(WP.STAGES.map(s => s[0])));
  assert.deepEqual(plain(require('../js/dev-table.js').STAGE_CLS), plain(WP.STAGE_CLS));
});

test('the layers in plain words, across the app; capacity bars keep the most-certain-first order', () => {
  const B = require('../js/layer-bar.js');
  assert.deepEqual(plain(B.LABEL), { existing: 'On the system (2021 census)', built: 'Built since 2021', committed: 'Past plan approval (MECP D-5-1)', commitPeel: 'Committed (site servicing or building permit)', approved: 'Plan approved, not committed', proposed: 'In review', anticipated: 'Pre-application', to2051: 'To 2051' });
  assert.deepEqual(plain(B.SHORT), { existing: 'On the system', built: 'Built since 2021', committed: 'Past plan approval', commitPeel: 'Committed', approved: 'Plan approved, not committed', proposed: 'In review', anticipated: 'Pre-application', to2051: 'To 2051' }, '"Approved" never alone');
  assert.deepEqual(plain(require('../js/layers.js').LABEL), plain(B.LABEL), 'one set of names');
  // A capacity bar stacks from the base: on the system, built, approved, in review.
  const seg = (layer, value) => ({ layer, value, title: `${B.LABEL[layer]}: ${value}` });
  const k = { existing: 50, built: 10, committed: 80, buildout: 100 };
  assert.deepEqual(plain(B.commitSegs({ ...k, rule: 'd51' }, seg).map(s => [s.layer, s.value])), [['existing', 50], ['built', 10], ['committed', 20], ['proposed', 20]], 'a treatment plant: past plan approval (MECP D-5-1)');
  const peel = B.commitSegs({ ...k, rule: 'peel' }, seg);
  assert.deepEqual(plain(peel.map(s => s.layer)), ['existing', 'built', 'commitPeel', 'proposed'], 'elsewhere: a site servicing or building permit');
  assert.match(peel[3].title, /^Not committed yet \(plan approved without a permit, or in review\): 20$/);
  assert.match(src('js/svc-capacity.js'), /segments: LB\(\)\.commitSegs \? LB\(\)\.commitSegs\(\{ \.\.\.r, rule: ruleOf\(r\) \}, seg\)/);
  assert.match(src('js/svc-capacity.js'), /\$\{pctTxt\(r\.pctCom\)\} \$\{comWords\(r\)\} → \$\{pctTxt\(r\.pctBo\)\} at build-out/);
});

test('Growth drill-down: Peel → municipality → plan → precinct / sub-area → its files by stage; employment', () => {
  const s = src('js/ws-pages.js');
  // The tree is Growth › Areas' own; a level's developments are its leaves' (a split site counts its share).
  assert.match(s, /const r = PT && PT\.compute \?/);
  assert.match(s, /function nodeDevs\(n, out = new Map\(\)\) \{\s*for \(const d of n\.devs\) out\.set\(d\.p, \(out\.get\(d\.p\) \|\| 0\) \+ d\.share\);\s*for \(const c of n\.children\) nodeDevs\(c, out\);/);
  // A row opens the next level; the trail goes back up; the stage bars filter the files.
  assert.match(s, /const kidRow = c => \(\{ attrs: \{ 'data-ws-drill': c\.id/);
  assert.match(s, /data-ws-drill="\$\{esc\(x\.id\)\}">\$\{esc\(x\.name\)\}<\/button>/);
  assert.match(s, /\$\{st\.click && r\.units >= 0\.5 \? ` data-ws-stage="\$\{r\.key\}" tabindex="0"` : ''\}/, 'a stage with no units is not clickable (bundle 6)');
  assert.match(s, /label: '↑ Up a level', attrs: \{ 'data-ws-drill': n\.parent \|\| 'peel' \}/);
  // Employment: a figure and its own list (floor area planned, permitted, completed, left; jobs).
  assert.match(s, /label: 'employment', ctx: emp\.planned >= 1 \?/);
  assert.match(s, /\{ title: 'Employment', rows: empRows/);
  // Mississauga's plans are character areas.
  assert.match(s, /n\.kind === 'plan' && muni === 'Mississauga' \? 'character area'/);
  // A stage with no files still shows the table (and its stage switch).
  assert.match(s, /empty: `No developments \$\{gStage === 'all' \? 'with planned units'/);
  // The developments table: grouped by the next level down (each group opens its level), by stage or
  // by site servicing permit; under the map, its treemap.
  assert.match(s, /const groups = by === 'area' \? kidRows\.map\(\(\[c, rows\]\) => \(\{ key: c\.id, name: c\.name, sub: kind\(c\), drill: c\.id, rows \}\)\)/);
  assert.match(s, /after: treemap \}/);
});

test('a development’s stage on the chart: the rung holding most of its units; built once none are left', () => {
  assert.equal(WP.stageOf({ top: 'plan', built: 0, existing: 0 }), 'plan');
  assert.equal(WP.stageOf({ top: null, built: 30, existing: 0 }), 'built');
  assert.equal(WP.stageOf({ top: null, built: 0, existing: 10 }), 'built');
  assert.equal(WP.stageOf({ top: null, built: 0, existing: 0 }), null);
  assert.equal(WP.stageOf(null), null);
  // Shares: a site split between two plans counts its share in each; an estimate spreads over its rungs.
  const st = WP.stageRows([{ p: 'a', share: 0.25 }], () => ({ rungs: { review: 300, servicing: 100 }, built: 0, existing: 0, estimated: 200, left: 400 }));
  assert.equal(st.rows.find(r => r.key === 'review').units, 75);
  assert.deepEqual([st.rows.find(r => r.key === 'review').est, st.rows.find(r => r.key === 'servicing').est], [37.5, 12.5]);
});

test('estimated counts: a file’s units left to build not stated on it, its share, split over its kinds', () => {
  const a = { key: 'a', count: { parts: [{ kind: 'stated', units: 100 }, { kind: 'precon', units: 300 }, { kind: 'online', units: 100 }] } };
  const b = { key: 'b', count: { parts: [{ kind: 'stated', units: 50 }] } };
  const c = { key: 'c', count: { parts: [{ kind: 'estimate', units: 80 }] } };
  const L = { a: { layer: 'anticipated', estimated: 400 }, b: { layer: 'proposed', estimated: 0 }, c: { layer: 'proposed', estimated: 80 } };
  const e = WP.estimateRows([{ p: a, share: 0.5 }, { p: b, share: 1 }, c], p => L[p.key]);
  assert.equal(e.units, 280);
  assert.deepEqual(plain(e.files.map(x => x.p.key)), ['a', 'c']);   // b states its count; largest first
  assert.deepEqual(plain(e.byKind), { precon: 150, online: 50, estimate: 80 });
  assert.deepEqual(plain(Object.keys(WP.EST_KINDS).sort()), ['estimate', 'online', 'permits', 'precon']);
  // The same kinds as the hatching (js/layers.js ESTIMATED).
  assert.match(src('js/layers.js'), /const ESTIMATED = new Set\(\['online', 'precon', 'estimate', 'permits'\]\)/);
  // On the Growth page: a list at every level, at the chosen stage, its rows open Check a site.
  const s = src('js/ws-pages.js');
  assert.match(s, /estRows\.length \? \{ title: gStage === 'all' \? 'Estimated counts: files to confirm'/);
  assert.match(s, /items\.filter\(\(\{ p \}\) => gStage === 'all' \|\| stageOf\(rOf\(p\)\) === gStage\), rOf\)/);
  assert.match(s, /\.\.\.es\.files\.map\(x => \(\{ attrs: \{ 'data-ws-pick': x\.p\.key, 'data-ws-as': 'site'/);
  // The area kind sits on the detail line, not after the name (where it wrapped with a stray dot).
  assert.match(s, /<span class="pnl-r-name">\$\{esc\(c\.name\)\}<\/span>.*<small class="pnl-r-line">\$\{esc\(kind\(c\)\)\} · /);
});

test('estimated counts: a file mixing kinds is split in proportion, and the page says so', () => {
  const s = src('js/ws-pages.js');
  assert.match(s, /for \(const x of parts\) kinds\[x\.kind\] = \(kinds\[x\.kind\] \|\| 0\) \+ est \* x\.units \/ raw;/);
  assert.match(s, /A file with more than one kind of estimate is split between them in proportion to their units\./);
  assert.match(s, /\(split in proportion\)/);
  assert.match(s, /has its estimate split between the kinds in proportion to their units/);
});
