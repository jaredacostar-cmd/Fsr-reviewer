'use strict';
// Layer groups (Stage 3): the six groups, the view presets, the fixed draw order, share links and
// saved views (old ones included), and layers loading only when switched on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const LG = require('../js/layer-groups.js');
const G = require('../js/constraint-geo.js');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const keys = g => LG.GROUPS.find(x => x.key === g).layers.map(l => l[0]);

test('six groups in order, with the brief\'s layers', () => {
  assert.deepEqual(LG.GROUPS.map(g => g.label), ['Developments', 'Capacity', 'Infrastructure', 'Constraints', 'Planning context', 'Base map']);
  assert.deepEqual(keys('devs'), ['devs', 'heat', 'hov']);
  assert.deepEqual(keys('cap'), ['cap', 'pz', 'bk', 'dr']);
  assert.deepEqual(keys('infra'), ['ex-water', 'ex-sanitary', 'ex-storm', 'wf', 'dcw', 'gas', 'hydro']);
  assert.equal(LG.GROUPS.find(g => g.key === 'infra').sub.gas, 'Other utilities');
  assert.deepEqual(keys('cx'), ['reg', 'flood', 'greenbelt', 'orm', 'nep', 'natural', 'nhs', 'source', 'water']);
  assert.match(LG.LAYER.get('source').disabled, /Not included/);
  assert.deepEqual(keys('plan'), ['sp', 'pr', 'mtsa', 'da']);
  assert.deepEqual(keys('base'), ['hill']);
  assert.equal(new Set(LG.KEYS).size, LG.KEYS.length, 'each layer in one group');
});

test('presets: everything off except Developments; each view adds its own', () => {
  for (const v of ['planning', 'water', 'wastewater', 'dc']) assert.ok(LG.PRESETS[v].includes('devs'), v);
  assert.deepEqual(LG.PRESETS.planning.filter(k => k !== 'devs' && k !== 'hov'), ['sp', 'mtsa']);
  assert.deepEqual(LG.PRESETS.water.filter(k => k !== 'devs' && k !== 'hov').sort(), ['cap', 'dcw', 'ex-water', 'pz', 'wf']);
  assert.deepEqual(LG.PRESETS.wastewater.filter(k => k !== 'devs' && k !== 'hov').sort(), ['bk', 'cap', 'dcw', 'ex-sanitary']);
  // Each servicing view shows its own system's planned works; Capital shows both.
  const s = src('js/map-analysis.js');
  assert.match(s, /wf: true, dc: \{ on: true, sys: 'water' \} \}/);
  assert.match(s, /wf: false, dc: \{ on: true, sys: 'wastewater' \} \}/);
  assert.deepEqual(LG.PRESETS.dc.filter(k => k !== 'devs' && k !== 'hov'), ['dcw']);
  // No constraint, utility or base-map layer is on in any preset (gas / hydro off by default).
  for (const p of Object.values(LG.PRESETS)) for (const k of p) assert.ok(!['cx', 'base'].includes(LG.groupOf(k)) && k !== 'gas' && k !== 'hydro', k);
});

test('the map views apply the same presets (map-analysis VIEW_PRESETS + the groups\' other layers)', () => {
  const s = src('js/map-analysis.js');
  const lit = s.slice(s.indexOf('const VIEW_PRESETS = {') + 'const VIEW_PRESETS = '.length, s.indexOf('\n  };', s.indexOf('const VIEW_PRESETS = {')) + 4);
  const VP = new Function('PD', 'PIPE_RESULTS', `return (${lit});`)({ basemapForView: v => v }, false);
  const extra = new Function(`${s.match(/const LG_EXTRA = \[[^\]]+\];/)[0]} return LG_EXTRA;`)();
  for (const v of Object.keys(LG.PRESETS)) {
    const legacy = LG.fromLegacy(VP[v], { blocks: true });
    const on = new Set([...legacy.on, ...LG.PRESETS[v].filter(k => extra.includes(k))]);
    assert.deepEqual([...on].sort(), [...LG.PRESETS[v]].sort(), v);
  }
  // Remembered per view: the saved settings carry the layers and open groups.
  assert.match(s, /layers: \[\.\.\.LG\(\)\.onSet\(\)\], groups: \[\.\.\.LG\(\)\.getOpen\(\)\]/);
  assert.match(s, /if \(saved && Array\.isArray\(saved\.layers\)\) LG\(\)\.apply\(new Set\(saved\.layers\), extra\);\n\s+else if \(!saved\) LG\(\)\.apply\(LG\(\)\.presetFor\(v\), extra\);/);
});

test('draw order: base map → hillshade → constraints → planning areas → capacity → infrastructure → developments → selection', () => {
  const zs = LG.DRAW_ORDER.map(([, k]) => LG.Z[k]);
  for (let i = 1; i < zs.length; i++) assert.ok(zs[i] > zs[i - 1], `${LG.DRAW_ORDER[i][0]} above ${LG.DRAW_ORDER[i - 1][0]}`);
  // Every pane takes its z-index from PeelLayerGroups.Z (with the same number as a fallback).
  for (const [f, pane, k] of [['js/map-core.js', 'imageryPane', 'imagery'], ['js/elevation.js', 'hillPane', 'hill'], ['js/constraints.js', 'cxPane', 'cx'], ['js/map-census.js', 'daPane', 'da'], ['js/plan-areas.js', 'planPane', 'plan'], ['js/svc-data.js', 'svcPane', 'svc'], ['js/exist-pipes.js', 'existPane', 'exist'], ['js/dc-infra.js', 'infraPane', 'infra'], ['js/svc-data.js', 'flowPane', 'flow'], ['js/area-select.js', 'selPane', 'sel']]) {
    const s = src(f);
    assert.ok(s.includes(`PeelLayerGroups.Z.${k} : ${LG.Z[k]})`), `${f}: ${pane} at Z.${k}`);
  }
  assert.match(src('js/dc-infra.js'), /className: 'dc-line', pane: 'infraPane'/);
  assert.match(src('js/area-select.js'), /selCanvas = L\.canvas\(\{ pane: 'selPane'/);
  // Constraint fills stay at or under 25%.
  for (const m of src('js/constraints.js').matchAll(/fillOpacity: ([^,}]+)/g)) for (const v of m[1].match(/0\.\d+/g)) assert.ok(+v <= LG.CX_FILL_MAX, m[0]);
});

test('share links: layers and open groups round-trip; unknown keys are dropped', () => {
  const s = LG.encode(new Set(['devs', 'reg', 'flood', 'sp']), new Set(['cx', 'devs']));
  assert.equal(s, 'devs.reg.flood.sp~devs.cx');
  const d = LG.decode(s);
  assert.deepEqual([...d.on], ['devs', 'reg', 'flood', 'sp']);
  assert.deepEqual([...d.open], ['devs', 'cx']);
  assert.deepEqual([...LG.decode('devs.zoning.reg~cx.later').on], ['devs', 'reg']);
  assert.equal(LG.decode(''), null);
  assert.equal(LG.decode(null), null);
  const sh = src('js/share.js');
  assert.match(sh, /set\('lg', window\.PeelLayerGroups\.encodeCurrent\(\)\)/);
  assert.match(sh, /window\.PeelLayerGroups\.applyEncoded\(lg\)/);
});

test('old links and saved views open with the equivalent layers', () => {
  // An old link has no lg=: nothing is forced (the view's layers and ms= apply, as before).
  assert.equal(LG.decode(new URLSearchParams('ms=layer.pop.pipes&m=43.7,-79.7,12').get('lg')), null);
  assert.match(src('js/share.js'), /if \(q\.get\('ms'\)\) \{ const \[color, size, cap\] = q\.get\('ms'\)\.split\('\.'\);/);
  // An old saved view (before the groups): its settings name these layers, and only these.
  const old = { basemap: 'dark', labelMode: 'off', da: false, wf: true, pz: true, dr: false, mstyle: { color: 'layer', size: 'pop', cap: 'zone' }, exist: { water: true, sanitary: false, storm: false }, dc: { on: true, sys: 'water' } };
  const m = LG.fromLegacy(old, { blocks: true });
  assert.deepEqual([...m.on].sort(), ['cap', 'dcw', 'ex-water', 'pz', 'wf']);
  assert.ok(m.named.has('bk') && !m.named.has('reg') && !m.named.has('sp'), 'constraints and plan areas are left as they are');
  // Saved views without layers do not reset the groups' other layers.
  assert.match(src('js/map-analysis.js'), /Saved views from before the groups leave them as they are/);
  assert.equal(LG.fromLegacy({ dr: true }, { blocks: false }).on.has('dr'), true);
  assert.equal(LG.fromLegacy(null), null);
});

test('group header, summary and switch', () => {
  const cx = LG.GROUPS.find(g => g.key === 'cx');
  const on = new Set(['reg', 'flood', 'water']);
  assert.equal(LG.headerText(cx, on, new Set(['reg', 'water'])), '3 on · 2 in view');
  assert.equal(LG.headerText(cx, new Set(), null), 'off');
  assert.equal(LG.summaryText(cx, on), 'Regulation limits, Floodplain, Watercourses');
  assert.equal(LG.summaryText(cx, new Set()), 'None on');
  assert.deepEqual([...LG.groupToggle(cx, new Set(['devs']))].sort(), ['devs', 'flood', 'reg']);
  assert.deepEqual([...LG.groupToggle(cx, new Set(['devs', 'reg', 'nhs']))], ['devs']);
  const html = LG.panelHTML({ on, open: new Set(['cx']), inView: new Set(['reg']), swatch: () => '' });
  assert.equal((html.match(/class="lg-grp/g) || []).length, 6);
  assert.match(html, /data-grp="cx">[\s\S]*?aria-expanded="true"[\s\S]*?3 on · 1 in view/);
  assert.match(html, /<div class="lg-sub">Other utilities<\/div>/);
  assert.match(html, /id="lyr-reg" data-lyr="reg" checked/);
  assert.match(html, /Source protection \(not included\)<\/span><small class="muted">n\/a/);
  assert.match(html, /data-grp-sum="infra">None on/);
});

// A tiny browser for the modules below.
function env(over = {}) {
  const stored = {};
  const calls = [];
  const map = { createPane: () => ({ style: {} }), getPane: () => null, getContainer: () => ({ classList: { add() {}, remove() {} } }), closeTooltip() {}, getZoom: () => 14, getBounds: () => ({ getWest: () => -79.705, getEast: () => -79.695, getSouth: () => 43.695, getNorth: () => 43.705 }), on() {}, whenReady(fn) { fn(); } };
  const chain = () => ({ addTo() { return this; }, bindTooltip() { return this; }, on() { return this; }, clearLayers() {} });
  const window = {
    PeelUtil: { $: () => null, esc: s => String(s), token: () => '#000', store: { get: (k, d) => (k in stored ? stored[k] : d), set: (k, v) => { stored[k] = v; } } },
    PeelMapCore: { map }, PeelConstraintGeo: G,
    PeelCxData: { BASE: 'data/constraints/', index: id => { calls.push(`index:${id}`); return Promise.resolve({ _have: new Set(), labels: [] }); }, tile: (id, x, y) => { calls.push(`tile:${id}`); return Promise.resolve([]); }, manifest: () => { calls.push('manifest'); return Promise.resolve(null); } },
    L: { canvas: () => ({}), layerGroup: chain, polygon: chain, polyline: chain, DomEvent: { stop() {} } },
    fetch: url => { calls.push(`fetch:${url}`); return Promise.resolve({ ok: false, json: () => ({}) }); },
    ...over,
  };
  window.window = window; window.globalThis = window;
  return { window, calls, stored };
}

test('constraint layers load only when switched on (no request at start, one layer\'s files when on)', async () => {
  const { window, calls } = env();
  vm.runInNewContext(src('js/constraints.js'), window);
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(calls, [], 'nothing fetched with every layer off');
  window.PeelConstraints.setOn({ reg: true });
  await new Promise(r => setTimeout(r, 20));
  assert.ok(calls.some(c => c === 'index:reg-cvc') && calls.some(c => c === 'index:reg-trca'), calls.join(' '));
  assert.ok(!calls.some(c => /flood|greenbelt|psw|wc-|utility/.test(c)), 'only the switched-on layer');
});

test('the hillshade adds no tile layer until switched on', () => {
  const s = src('js/elevation.js');
  assert.match(s, /let hill = null, hillOn = !!\(store && store\.get\('hillshade', false\)\);/);
  assert.match(s, /if \(hillOn && map\) map\.whenReady\(\(\) => setHillshade\(true\)\);/);
});

test('phone: one group open at a time; desktop keeps several open', () => {
  const run = narrow => {
    const { window } = env({ matchMedia: () => ({ matches: narrow }) });
    window.matchMedia = () => ({ matches: narrow });
    vm.runInNewContext(src('js/layer-groups.js'), window);
    const L0 = window.PeelLayerGroups;
    L0.setOpen('cx', true); L0.setOpen('plan', true);
    return [...L0.getOpen()].sort();
  };
  assert.deepEqual(run(true), ['plan']);
  assert.deepEqual(run(false), ['cx', 'devs', 'plan']);
});

test('the Layers panel is built from the groups and keeps the panel off the selected development', () => {
  const mm = src('js/map-markers.js');
  assert.match(mm, /LG\(\)\.panelHTML\(\{ on: initialOn\(\), open: LG\(\)\.getOpen\(\)/);
  assert.match(mm, /LG\(\)\.bind\(el\);/);
  assert.ok(!/id="opt-exist"|id="opt-plan"/.test(mm), 'the old master switches are gone');
  // The development scope folds the Layers panel (it does not cover the selected feature).
  assert.match(src('js/devscope.js'), /_foldLayers/);
  const html = src('index.html');
  assert.ok(html.indexOf('js/layer-groups.js') < html.indexOf('js/map-core.js'), 'loads before the modules that make panes');
});

test('follows the Map controls board: zoom stated on the layer, the view preset with Reset, DC works marked draft', () => {
  // SPEC §4: "Existing pipes · from zoom 15"; the thresholds match the modules that draw them.
  assert.equal(LG.LAYER.get('ex-water').zoomText, 'from zoom 15');
  assert.match(src('js/map-markers.js'), /const EXIST_ZOOM = 15;/);
  const cx = src('js/constraints.js');
  for (const k of ['gas', 'hydro', 'water']) assert.equal(LG.LAYER.get(k).zoom, +cx.match(new RegExp(`${k}: \\{[^\\n]*minZoom: (\\d+)`))[1], k);
  assert.equal(LG.LAYER.get('hill').zoom, 11);
  assert.equal(LG.LAYER.get('reg').zoomText, 'detail from zoom 13');
  assert.match(cx, /const TILE_ZOOM = 13/);
  const html = LG.panelHTML({ on: new Set(['devs', 'hov', 'sp', 'mtsa']), open: new Set(['infra']), inView: null, view: { key: 'planning', label: 'Planning' } });
  assert.match(html, /^<div class="lg-preset" id="lg-preset"><span>Planning preset<\/span><\/div>/);
  assert.match(html, /Existing watermains<small class="lg-z"> · from zoom 15<\/small>/);
  assert.match(html, /Planned DC works · 2026 draft/);
  const changed = LG.panelHTML({ on: new Set(['devs', 'reg']), open: new Set(), inView: null, view: { key: 'planning', label: 'Planning' } });
  assert.match(changed, /Planning preset · <em>changed<\/em><\/span><button type="button" class="btn small link" data-lg-reset>Reset<\/button>/);
  assert.match(src('js/map-analysis.js'), /function resetView\(\) \{ const v = currentView\(\); store\.set\(`mapView-\$\{v\}`, null\); applyViewSettings\(v, null\); \}/);
});
