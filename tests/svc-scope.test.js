'use strict';
// Servicing scopes (design audit, Group 5): the servicing ladder as scopes, with its trail steps.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function load() {
  const blocks = [
    { id: 'dr:B1', name: 'Block 1', kind: 'block', plant: 'Clarkson', downstream: null },
    { id: 'dr:B2', block: '2', name: 'Block 2', kind: 'block', plant: 'Clarkson', downstream: 'dr:B1' },
    { id: 'dr:B3', name: 'Block 3', kind: 'block', plant: 'Clarkson', downstream: 'dr:B2' },
    { id: 'dr:B9', name: 'Block 9', kind: 'block', plant: 'Lakeview', downstream: null },
  ];
  const zones = [{ id: 'pz:3', name: 'Pressure zone 3', zone: '3' }, { id: 'pz:W', name: 'Well zone', zone: 'W' }];
  const ps = [{ id: 'ps:1', name: 'Some PS', kind: 'ps', plant: 'Lakeview', bbox: [0, 0, 1, 1], rings: [] }];
  const byId = new Map([...blocks, ...zones, ...ps].map(a => [a.id, a]));
  const kids = new Map(); for (const b of blocks) if (b.downstream) (kids.get(b.downstream) || kids.set(b.downstream, []).get(b.downstream)).push(b);
  const state = { servicing: { drainage: blocks, zones, psAreas: ps }, ss: null, svcGen: 1 };
  const window = {
    PeelUtil: require('../js/util.js'), PeelDemand: {}, PeelPhases: {},
    PeelApp: { state },
    PeelSvcData: { svcById: byId, PLANT_SHORT: { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson' }, plantLabel: pl => `${pl} plant`, drName: a => a.name, svcIds: (p, k) => p[k] || [] },
    PeelMasterPlan: { lakeZones: () => ['pz:3'] },
    PeelSvcTab: { svcFlowTree: () => kids, upstreamOf: (id, k) => { const out = []; const w = i => { for (const c of k.get(i) || []) { out.push(c); w(c.id); } }; w(id); return out; } },
    PeelAreas: { locate: (list, lng) => (lng < 1 ? list.map(a => a.id) : []) },
  };
  const ctx = { window, document: { addEventListener() {} }, module: undefined, globalThis: {} };
  vm.runInNewContext(src('js/svc-scope.js'), ctx);
  return { S: window.PeelSvcScope, state, window };
}

test('resolve: plant, block with everything upstream, station, zone, water system', () => {
  const { S } = load();
  const pl = S.resolve('plant:Clarkson');
  assert.equal(pl.kind, 'plant'); assert.deepEqual([...pl.ids].sort(), ['dr:B1', 'dr:B2', 'dr:B3']);
  const b = S.resolve('dr:B2');
  assert.equal(b.kind, 'block'); assert.deepEqual([...b.ids].sort(), ['dr:B2', 'dr:B3'], 'the block and the blocks upstream, not downstream');
  // (the I&I program's block and the servicing block are one: its I&I id, and the ref back; navigation phase 8a)
  assert.equal(b.a.block, '2'); assert.equal(S.blockRef(b.a.block), 'dr:B2');
  assert.equal(S.resolve('ps:1').kind, 'ps');
  const z = S.resolve('pz:3'); assert.equal(z.kind, 'zone'); assert.equal(z.lake, true);
  assert.equal(S.resolve('pz:W').lake, false);
  assert.equal(S.resolve('wsys:lake').kind, 'wsys');
  assert.equal(S.resolve('plant:Toronto'), null);
  assert.equal(S.resolve('dr:nope'), null);
});

// Review of navigation phase 8a: the block's card listed every block down to the plant ("Drains to"); the card
// is the block's scope now, so its ladder does (a link each), not the next block alone.
test('a block’s ladder names every block it drains through down to the plant; before the model a loading panel', () => {
  const { S, state, window } = load();
  window.PeelSvcTab.scenarioText = () => 'Scenario';
  state.svcModel = { cum: new Map(), adwf: () => 0 };
  const lad = h => h.slice(h.indexOf('Servicing ladder'));
  assert.match(lad(S.cardHTML(S.resolve('dr:B3'), [])), /<strong>Drains to<\/strong> <button[^>]*data-ss="dr:B2">Block 2<\/button> → <button[^>]*data-ss="dr:B1">Block 1<\/button> → <button[^>]*data-ss="plant:Clarkson">Clarkson plant<\/button><\/li>/);
  assert.match(lad(S.cardHTML(S.resolve('dr:B2'), [])), /<strong>Drains to<\/strong> <button[^>]*data-ss="dr:B1">Block 1<\/button> → <button[^>]*data-ss="plant:Clarkson">/);
  assert.match(lad(S.cardHTML(S.resolve('dr:B1'), [])), /<strong>Drains to<\/strong> the plant directly → <button[^>]*data-ss="plant:Clarkson">/);
  // The lookup filled, the model not built yet (it needs the census too): the panel says so for every kind
  // instead of throwing (headroom and the ladder read the model), as the full table's skeleton does.
  state.svcModel = null;
  for (const ref of ['dr:B3', 'plant:Clarkson', 'ps:1', 'pz:3', 'wsys:lake']) {
    const s = S.resolve(ref), p = S.panelSpec(s, []);
    assert.match(p.answer, /Loading the servicing model/, ref); assert.equal(p.head.name, s.title);
    assert.equal(p.head.trail.map(t => t.label).join(' › '), `Peel › ${s.title}`); assert.ok('data-ss-close' in p.head.close);
    assert.match(S.cardHTML(s, []), /Loading the servicing model/);
  }
});

test('has: developments in the scope only; no scope keeps every development', () => {
  const { S, state } = load();
  const up = { dr: ['dr:B3'] }, down = { dr: ['dr:B1'] }, other = { dr: ['dr:B9'] };
  assert.equal(S.has(other), true, 'no scope');
  state.ss = 'dr:B2';
  assert.equal(S.has(up), true); assert.equal(S.has(down), false); assert.equal(S.has(other), false);
  state.ss = 'plant:Clarkson';
  assert.equal(S.has(down), true); assert.equal(S.has(other), false);
  state.ss = 'ps:1';
  assert.equal(S.has({ lat: 0.5, lng: 0.5 }), true); assert.equal(S.has({ lat: 0.5, lng: 2 }), false);
});

test('trail steps run top of the ladder first', () => {
  const { S, state } = load();
  state.ss = 'dr:B3';
  assert.deepEqual([...S.crumbs().map(c => c.label)], ['Clarkson', 'Block 3']);
  state.ss = 'ps:1';
  assert.deepEqual([...S.crumbs().map(c => c.label)], ['G.E. Booth', 'Some PS']);
  state.ss = 'pz:3';
  assert.deepEqual([...S.crumbs().map(c => c.label)], ['South Peel water', 'Pressure zone 3']);
  state.ss = 'pz:W';
  assert.deepEqual([...S.crumbs().map(c => c.label)], ['Well zone']);
  state.ss = null; assert.equal(S.crumbs().length, 0);
});

test('wired in: filter, trail, Overview, search, share link, reset, "What loads this?"', () => {
  assert.match(src('index.html'), /<script src="js\/svc-scope\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/svc-scope\.js',/);
  assert.match(src('js/app.js'), /if \(state\.ss && window\.PeelSvcScope && !window\.PeelSvcScope\.has\(p\)\) return false;/);
  assert.match(src('js/topbar.js'), /steps\.push\(\.\.\.window\.PeelSvcScope\.crumbs\(\)\)/);
  assert.match(src('js/topbar.js'), /function goPeel\(\) \{\n {4}if \(window\.PeelSvcScope\) window\.PeelSvcScope\.clear\(\);/);
  assert.match(src('js/overview-tab.js'), /const sset = set \|\| DU\(\)\.overviewSet\(\); el\.innerHTML = root\.PeelSvcScope\.cardHTML\(ss, sset\) \+ CX_HOST; fillCxCard\(sset\);/);
  // Stage 3: the scope's standard panel (the card is its full table).
  assert.match(src('js/overview-tab.js'), /root\.PeelPanel\.set\('overview:', root\.PeelSvcScope\.panelSpec\(ss, sset\)\)/);
  assert.match(src('js/overview-tab.js'), /data-ss="\$\{c\.kind === 'plant' \? `plant:/, 'Peel capacity bars open the plant scope');
  const sf = src('js/search-filter.js');
  assert.match(sf, /SS\(\)\.open\(`plant:\$\{pl\}`\)/); assert.match(sf, /area\('Water pressure zone', a, \(\) => SS\(\)\.open\(a\.id\), \{ hit: 'svc', ss: a\.id \}\)/); assert.match(sf, /psAreas/);
  const sh = src('js/share.js');
  assert.match(sh, /set\('ss', App\(\)\.state\.ss && window\.PeelSvcScope/); assert.match(sh, /else App\(\)\.state\.ss = ss;/);
  // Result scopes (SPEC §3): re-opened from a link once their data loads.
  assert.match(sh, /S\.isResultRef\(ss\)\) \{ App\(\)\.state\.ss = null; setTimeout\(\(\) => S\.restore\(ss\), 0\);/);
  assert.match(src('js/filter-ui.js'), /dr: \[\], ss: null,/);
  assert.match(src('js/tool-scope.js'), /window\.PeelSvcScope\.open\(plantName \? `plant:\$\{plantName\}` : id\)\) return;/);
});

test('a block’s Overview folds its I&I program facts before the ladder, a block only (navigation phase 8a)', () => {
  const sc = src('js/svc-scope.js'), ps = sc.slice(sc.indexOf('function panelSpec('), sc.indexOf('function cardHTML('));
  const folds = ps.slice(ps.indexOf('folds: ['), ps.indexOf('method:'));
  assert.match(folds, /\.\.\.\(s\.kind === 'block' && ST\(\) && ST\(\)\.blockFactsHTML \? \[\{ title: 'The block in the I&I program', html: ST\(\)\.blockFactsHTML\(s\.a\.block\) \}\] : \[\]\),/);
  assert.ok(folds.indexOf('The block in the I&I program') < folds.indexOf("title: 'Servicing ladder'"), 'before the ladder');
  assert.equal(folds.split('blockFactsHTML(').length, 2, 'once');
  // The full table (cardHTML) the same section, before its ladder.
  const card = sc.slice(sc.indexOf('function cardHTML('), sc.indexOf('const PEEL_WIDE'));
  assert.match(card, /const iib = s\.kind === 'block' && ST\(\) && ST\(\)\.blockFactsHTML \? ST\(\)\.blockFactsHTML\(s\.a\.block\) : '';/);
  assert.ok(card.indexOf('<section class="ov-card ss-iib">') > 0 && card.indexOf('<section class="ov-card ss-iib">') < card.indexOf('${ladder(s)}'));
  // js/sewer-trace.js: the facts from blockNet(), '' while the sewers or blocks load, asked for once per block,
  // then the Overview redrawn only while that block is still the scope.
  const st = src('js/sewer-trace.js'), f = st.slice(st.indexOf('function blockFactsHTML('), st.indexOf('const api = {'));
  assert.match(f, /const net = blockNet\(\), x = net && net\.byId\.get\(String\(id\)\);/);
  assert.match(f, /if \(!factsAsked\.has\(String\(id\)\)\) \{\n {8}factsAsked\.add\(String\(id\)\);\n {8}Promise\.all\(\[loadBlocks\(\), SC\(\)\.loadSewers\(\)\]\)\.then\(\(\) => \{ const S = root\.PeelSvcScope, s = S && S\.current\(\); if \(blockNet\(\) && s && s\.ref === S\.blockRef\(id\)/);
  for (const w of ['data-pipe="${i}"', 'full-flow capacity', 'people upstream (2021)', 'Region sanitary mains of 300 mm+ inside the block', 'km along the sewers to', 'Prioritised for a block study', '<em>Block_view</em>']) assert.ok(f.includes(w), w);
  assert.match(st, /clearBlockFocus, showBlock, blockFactsHTML,/);
});
