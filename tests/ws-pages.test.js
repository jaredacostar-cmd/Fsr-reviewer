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
  assert.deepEqual(plain(WP.sectionsOf(h)), ['header', 'scenario', 'answer', 'caveat', 'figures', 'chart', 'list', 'map', 'list', 'fold', 'method', 'sources', 'footer']);
  assert.equal((h.match(/class="pnl-fig[ "]/g) || []).length, 4, 'at most four figures');
  assert.equal((h.match(/<li class="pnl-row/g) || []).length, 6, 'five rows of the first list, one of the second');
  assert.match(h, /<h3>Soonest limits<\/h3><button type="button" class="btn small link" data-ws-go="tight">See all \(6\) →<\/button>/);
  // The first list sits beside the map (Home's two columns); the map opens the workspace's map view.
  assert.match(h, /<div class="home-cols"><section class="pnl-list page-list" data-psec="list">[\s\S]*?<section class="home-map" data-psec="map">[\s\S]*?<button type="button" class="home-map-btn" data-ws-go="tight"/);
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
  assert.match(s, /label: 'relief after the limit'/);
  assert.match(s, /late = rows\.filter\(r => r\.relief === 'gap'\)/);
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
  assert.match(s, /const BUILD = \{ home, tight, site, growth, projects, week, fsr, pipes, study \};/);
  // A page's map buttons open the workspace's map view; Full map is the all-tools map; the map view has
  // a way back to the page.
  assert.match(w, /const pg = e\.target\.closest\('\[data-ws-page\]'\);\s*if \(pg\) \{ e\.preventDefault\(\); openPage\(pg\.dataset\.wsPage\); return; \}/);
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
