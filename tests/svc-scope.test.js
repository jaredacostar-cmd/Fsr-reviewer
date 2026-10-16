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
    { id: 'dr:B2', name: 'Block 2', kind: 'block', plant: 'Clarkson', downstream: 'dr:B1' },
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
  return { S: window.PeelSvcScope, state };
}

test('resolve: plant, block with everything upstream, station, zone, water system', () => {
  const { S } = load();
  const pl = S.resolve('plant:Clarkson');
  assert.equal(pl.kind, 'plant'); assert.deepEqual([...pl.ids].sort(), ['dr:B1', 'dr:B2', 'dr:B3']);
  const b = S.resolve('dr:B2');
  assert.equal(b.kind, 'block'); assert.deepEqual([...b.ids].sort(), ['dr:B2', 'dr:B3'], 'the block and the blocks upstream, not downstream');
  assert.equal(S.resolve('ps:1').kind, 'ps');
  const z = S.resolve('pz:3'); assert.equal(z.kind, 'zone'); assert.equal(z.lake, true);
  assert.equal(S.resolve('pz:W').lake, false);
  assert.equal(S.resolve('wsys:lake').kind, 'wsys');
  assert.equal(S.resolve('plant:Toronto'), null);
  assert.equal(S.resolve('dr:nope'), null);
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
  assert.match(sf, /SS\(\)\.open\(`plant:\$\{pl\}`\)/); assert.match(sf, /area\('Water pressure zone', a, \(\) => SS\(\)\.open\(a\.id\)\)/); assert.match(sf, /psAreas/);
  const sh = src('js/share.js');
  assert.match(sh, /set\('ss', App\(\)\.state\.ss && window\.PeelSvcScope/); assert.match(sh, /else App\(\)\.state\.ss = ss;/);
  // Result scopes (SPEC §3): re-opened from a link once their data loads.
  assert.match(sh, /S\.isResultRef\(ss\)\) \{ App\(\)\.state\.ss = null; setTimeout\(\(\) => S\.restore\(ss\), 0\);/);
  assert.match(src('js/filter-ui.js'), /dr: \[\], ss: null,/);
  assert.match(src('js/tool-scope.js'), /window\.PeelSvcScope\.open\(plantName \? `plant:\$\{plantName\}` : id\)\) return;/);
});
