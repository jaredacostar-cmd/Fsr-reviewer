'use strict';
// Stage 2: Construction and EA map layers, the tap picker and the EA / capital project scopes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const M = require('../js/capital-ea-model.js');
const C = require('../scripts/capital-lib.js');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const sample = JSON.parse(src('tests/fixtures/capital-sample.json'));
const eas = JSON.parse(src('data/eas.json'));
const SCREEN = '<p class="screen-note">General screening results only. Peel’s W&amp;WW Infrastructure Planning team must validate or confirm all results.</p>';

test('work types read as plain words', () => {
  assert.equal(M.workLabel('WM'), 'Watermain');
  assert.equal(M.workLabel('SAN-TRENCHLESS'), 'Sanitary sewer (trenchless)');
  assert.equal(M.workLabel('Sanitary - Trenchless'), 'Sanitary sewer (trenchless)');
  assert.equal(M.workLabel('WM-TUNNELING'), 'Watermain (tunnelling)');
  assert.equal(M.workLabel('ROAD-WIDENING 2-4 LANES'), 'Road: widening 2–4 lanes');
  assert.equal(M.workLabel(''), 'Capital work');
});

test('construction layer: planned and building only; system filter; results-year fading', () => {
  const all = { water: true, wastewater: true, roads: true };
  const by = s => sample.records.find(r => r.status === s);
  assert.ok(M.capitalShown(by('under construction'), all));
  assert.ok(M.capitalShown(by('planned'), all));
  assert.equal(M.capitalShown(by('complete'), all), false, 'completed work is not on the layer');
  assert.equal(M.capitalShown(by('under construction'), { ...all, water: false }), false);
  assert.ok(M.isBuilding(by('under construction')));
  assert.equal(M.isBuilding(by('planned')), false);
  const r = { status: 'under construction', substantialTarget: '2027-06-01' };
  assert.equal(M.fadedAt(r, 2026), true, 'not in service by 2026');
  assert.equal(M.fadedAt(r, 2027), false);
  assert.equal(M.fadedAt(r, null), false, 'build-out: nothing fades');
  assert.equal(M.fadedAt({ status: 'planned' }, 2030), true, 'planned with no date fades');
});

test('contracts group the segments of one project page', () => {
  const cs = M.contracts(sample.records);
  const c = cs.get('web:peelregion.ca/construction/project-90-0001');
  assert.equal(c.records.length, 2);
  assert.equal(c.status, 'under construction');
  assert.equal(c.percent, 60);
  assert.ok(c.lengthM > 2000);
  assert.deepEqual(c.projectNumbers, ['90-0001']);
});

test('slip wording is neutral and only when computable', () => {
  assert.equal(M.slipText(null), null);
  assert.equal(M.slipText({ start: 7 }), 'Start 7 months later than target');
  assert.equal(M.slipText({ tender: -1, award: 0 }), 'Award on target');
  assert.equal(M.slipText({ substantial: -2, start: 3 }), 'Substantial completion 2 months earlier than target');
  for (const r of sample.records) if (!(r.startTarget && r.startActual) && !(r.tenderTarget && r.tenderActual) && !(r.awardTarget && r.awardActual) && !(r.substantialTarget && r.substantialActual)) assert.equal(r.slip, null);
});

test('EA filters: completed hidden by default (current), all, completed; systems; unplaced not drawn', () => {
  const sys = { water: true, wastewater: true, roads: true };
  const done = { system: 'water', status: 'complete' }, live = { system: 'wastewater', status: 'consultation' };
  assert.equal(M.eaShown(done, 'current', sys), false);
  assert.equal(M.eaShown(live, 'current', sys), true);
  assert.equal(M.eaShown(done, 'completed', sys), true);
  assert.equal(M.eaShown(live, 'completed', sys), false);
  assert.equal(M.eaShown(done, 'all', sys), true);
  assert.equal(M.eaShown({ system: 'multi', status: 'addendum' }, 'current', { water: false, wastewater: true, roads: false }), true);
  assert.equal(M.eaShown({ system: 'storm', status: 'commenced' }, 'current', { water: true, wastewater: true, roads: false }), false);
  assert.equal(M.eaShown(live, 'current', { ...sys, wastewater: false }), false);
  assert.ok(M.eaDashed({ geomType: 'approx' }));
  assert.ok(M.eaDashed({ geomType: 'area', geomMethod: 'traced from the project page image' }));
  assert.equal(M.eaDashed({ geomType: 'facility', geomConfidence: 'high' }), false);
  assert.ok(M.eaUnplaced({ geometry: { type: 'Point', coordinates: [0, 0] }, geomMethod: 'municipality centre: Brampton' }));
  assert.equal(M.eaUnplaced({ geometry: { type: 'Point', coordinates: [0, 0] }, geomMethod: 'facility point: McVean Drive' }), false);
  // The layer's default state.
  assert.match(src('js/capital-ea.js'), /cons: false, ea: false, show: 'current'/);
});

test('picker ranking: priority order, areas are context, touch tolerance is wider', () => {
  const r = M.rankHits([
    { kind: 'area', key: 'z', d: 0 }, { kind: 'ea', key: 'e', d: 3 }, { kind: 'dc', key: 'd', d: 1 },
    { kind: 'construction', key: 'c', d: 5 }, { kind: 'facility', key: 'f', d: 9 }, { kind: 'development', key: 'v', d: 8 },
  ]);
  assert.deepEqual(r.targets.map(h => h.key), ['v', 'f', 'c', 'd', 'e']);
  assert.deepEqual(r.context.map(h => h.key), ['z']);
  const onlyAreas = M.rankHits([{ kind: 'area', key: 'a1', d: 0 }, { kind: 'area', key: 'a2', d: 0 }]);
  assert.deepEqual([onlyAreas.targets.map(h => h.key), onlyAreas.context.map(h => h.key)], [['a1'], ['a2']], 'an area is selected only when nothing else is hit');
  assert.ok(M.tolerance(true) > M.tolerance(false));
  assert.equal(M.pickHeading([{ short: 'EA' }, { short: 'watermain' }, { short: 'road' }]), '3 items here: EA · watermain · road');
  assert.ok(M.sameSpot([10, 10], [12, 13], 0, 3000));
  assert.equal(M.sameSpot([10, 10], [30, 10], 0, 1000), false);
  assert.equal(M.sameSpot([10, 10], [10, 10], 0, 5000), false);
});

test('hit distance in screen pixels: points, lines, inside polygons', () => {
  const toPx = ([x, y]) => [x, y];
  assert.equal(M.hitDistance([3, 4], { type: 'Point', coordinates: [0, 0] }, toPx), 5);
  assert.equal(M.hitDistance([5, 2], { type: 'LineString', coordinates: [[0, 0], [10, 0]] }, toPx), 2);
  assert.equal(M.hitDistance([5, 5], { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }, toPx), 0);
  assert.equal(M.hitDistance([15, 5], { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }, toPx), 5);
  assert.equal(M.hitDistance([0, 0], null, toPx), Infinity);
});

const order = html => [...html.matchAll(/data-sec="([^"]+)"/g)].map(m => m[1]);
test('EA scope sections in the agreed order, with the screening note, report link and Watch', () => {
  const done = eas.eas.find(e => e.status === 'complete');
  const html = M.eaScopeHTML(done, { screenNote: SCREEN, reportLink: '<a data-info="report-issue">Report data issue ↗</a>', watched: false, today: '2026-10-15' });
  assert.deepEqual(order(html), ['header', 'purpose', 'timeline', 'decision', 'outcomes', 'documents', 'footer']);
  assert.match(html, /General screening results only/);
  assert.match(html, /data-info="report-issue"/);
  assert.match(html, new RegExp(`data-watch="ea:${done.id}"`));
  const live = eas.eas.find(e => e.status === 'consultation');
  assert.deepEqual(order(M.eaScopeHTML(live, { screenNote: SCREEN })), ['header', 'purpose', 'timeline', 'outcomes', 'documents', 'footer'], 'no decision section before completion');
  assert.match(M.eaScopeHTML({ ...live, geomType: 'approx', geomConfidence: 'low' }, {}), /Approximate location/);
});

test('capital scope sections in order; slip is internal (hidden in the public view); no people anywhere', () => {
  const cs = M.contracts(sample.records);
  const c = cs.get('web:peelregion.ca/construction/project-90-0001');
  const html = M.capitalScopeHTML(c, { screenNote: SCREEN, reportLink: '<a data-info="report-issue">r</a>', dcLinks: [], ea: null });
  assert.deepEqual(order(html), ['header', 'progress', 'slip', 'why', 'facts', 'page', 'footer']);
  assert.match(html, /class="ce-slip pv-hide"/);
  assert.match(html, /Start 7 months later than target/);
  assert.match(html, /Not in the DC program/);
  assert.match(html, /General screening results only/);
  for (const k of C.NEVER) assert.equal(html.includes(k), false, k);
  assert.equal(/NEVER STORED/.test(html), false);
  assert.equal(C.hasForbidden(sample), false);
  const linked = M.capitalScopeHTML(c, { dcLinks: [{ key: 'water:line:c1', method: 'project', confidence: 'medium', diameter: 600, year: 2027, name: 'Mayfield Road Sub-Transmission Main' }], ea: { id: 'x', name: 'An EA', status: 'complete' } });
  assert.match(linked, /600 mm/);
  assert.match(linked, /data-ce-ea="x"/);
  const planned = M.capitalScopeHTML(cs.get('proj:90-0002'), {});
  assert.equal(order(planned).includes('slip'), false, 'no slip when not computable');
});

test('hover previews are one line', () => {
  const c = M.contracts(sample.records).get('web:peelregion.ca/construction/project-90-0001');
  assert.equal(M.capitalHover(c), 'Watermain · Sample Watermain Rd · Under construction · 60%');
  assert.match(M.eaHover({ name: 'X', status: 'complete' }), /^EA · X · Complete$/);
});

// The picker in a sandbox: a fake map and Leaflet popup.
function pickSandbox() {
  const popups = [];
  const window = {
    PeelCapitalEAModel: M,
    PeelMapCore: { map: { latLngToContainerPoint: ([lat, lng]) => ({ x: lng, y: lat }), closePopup() {}, on() {} } },
  };
  window.L = { popup: () => { const p = { setLatLng() { return p; }, setContent(h) { p.html = h; return p; }, openOn() { popups.push(p); return p; }, getElement: () => null }; return p; }, DomEvent: { stop() {} } };
  const ctx = { window, L: window.L, document: { addEventListener() {}, createElement() { return {}; } }, matchMedia: () => ({ matches: false }), setTimeout, Date, module: undefined, globalThis: {} };
  vm.runInNewContext(src('js/map-pick.js'), ctx);
  return { P: window.PeelPick, popups };
}
test('picker: overlapping features → list; one feature → opens directly; same spot again → next item', () => {
  const { P, popups } = pickSandbox();
  const opened = [];
  const hit = (kind, key, d) => ({ kind, key, d, label: key, short: kind, open: () => opened.push(key) });
  let hits = [hit('ea', 'ea1', 2), hit('construction', 'cap1', 3)];
  P.register({ id: 't', hits: () => hits });
  const ev = (x, y) => ({ latlng: [y, x], containerPoint: { x, y } });
  P.at(ev(100, 100));
  assert.equal(popups.length, 1);
  assert.match(popups[0].html, /2 items here: construction · ea/);
  assert.ok(popups[0].html.indexOf('cap1') < popups[0].html.indexOf('ea1'), 'construction before EA');
  P.at(ev(101, 100));
  assert.deepEqual(opened, ['ea1'], 'tapping the same spot steps to the next item');
  hits = [hit('construction', 'only', 1), { kind: 'area', key: 'zone', d: 0, label: 'Zone 6' }];
  P.at(ev(400, 400));
  assert.deepEqual(opened, ['ea1', 'only'], 'one target opens directly; the area is context');
});

test('wiring: scripts, offline cache, Layers switches, year re-render, legend, trail group, Esc, issue title', () => {
  const html = src('index.html'), sw = src('sw.js');
  for (const f of ['capital-ea-model', 'map-pick', 'capital-ea']) {
    assert.match(html, new RegExp(`<script src="js/${f}\\.js\\?v=__BUILD__"></script>`));
    assert.match(sw, new RegExp(`'js/${f}\\.js',`));
  }
  const mm = src('js/map-markers.js');
  assert.match(mm, /'opt-cons'.*'Planned &amp; under construction'/);
  assert.match(mm, /'opt-eas'.*'EAs'/);
  assert.match(mm, /id="ce-settings"/);
  const ma = src('js/map-analysis.js');
  assert.match(ma, /function renderCapLayer\(\) \{[\s\S]{0,200}PeelCapitalEA\.render\(\)/);
  assert.match(ma, /PeelCapitalEA\.legendHTML\(\)/);
  assert.match(src('js/tools.js'), /result\.group \? \[\{ label: result\.group/);
  assert.match(src('js/topbar.js'), /steps\.push\(\.\.\.\[\]\.concat\(tc\)\)/);
  assert.match(src('js/capital-ea.js'), /e\.key !== 'Escape'[\s\S]{0,200}closeResult\(\)/);
  assert.match(src('js/map-pick.js'), /closest\('\.leaflet-marker-icon, path\.leaflet-interactive'\)/);
  const RI = require('../js/report-issue.js');
  assert.equal(RI.issueTitle({ kind: 'ea', ref: 'Bolton', municipality: 'Caledon' }), 'Data issue: EA Bolton (Caledon)');
  assert.equal(RI.issueTitle({ kind: 'capital', ref: '22-2300' }), 'Data issue: Capital project 22-2300');
  assert.equal(RI.issueTitle({ kind: 'permit', ref: 'P1' }), 'Data issue: Permit P1');
});

test('new colours are tokens, distinct from phases, capacity and selection', () => {
  const css = src('css/app.css');
  const blocks = [css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: light)')), css.slice(css.indexOf('@media (prefers-color-scheme: light)'), css.indexOf(':root[data-theme="light"]')), css.slice(css.indexOf(':root[data-theme="light"]'))];
  for (const b of blocks) for (const t of ['--cons-build', '--cons-plan', '--ea-line']) assert.match(b, new RegExp(`${t}: #[0-9a-f]{6};`), t);
  const val = (b, t) => (new RegExp(`${t}: (#[0-9a-f]{6});`).exec(b) || [])[1];
  for (const b of blocks) {
    const reserved = ['--ph-inception', '--ph-review', '--ph-approved', '--ph-permit', '--ph-construction', '--ph-completed', '--ph-cancelled', '--cap-over', '--cap-tight', '--cap-room', '--select'].map(t => val(b, t)).filter(Boolean);
    for (const t of ['--cons-build', '--cons-plan', '--ea-line']) assert.equal(reserved.includes(val(b, t)), false, `${t} reuses a reserved colour`);
  }
  assert.doesNotMatch(src('js/capital-ea.js') + src('js/map-pick.js') + src('js/capital-ea-model.js'), /#[0-9a-fA-F]{6}\b/, 'no hard-coded colours');
});
