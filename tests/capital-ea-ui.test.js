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
  assert.equal(M.hitDistance([3, 4], { type: 'MultiPoint', coordinates: [[100, 100], [0, 0]] }, toPx), 5);   // several intersections
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
  assert.match(M.eaScopeHTML({ ...live, geomType: 'approx', geomConfidence: 'low', geomMethod: 'municipality centre: Brampton', geometry: { type: 'Point', coordinates: [-79.76, 43.69] } }, {}), /Approximate location/);
  // A study area traced from the project page map is dashed and says so.
  const traced = { ...live, geomType: 'area', geomConfidence: 'medium', geomMethod: 'traced from the project page image (3 control points, residual 22 m)', geometry: { type: 'Polygon', coordinates: [[[-79.7, 43.7], [-79.69, 43.7], [-79.69, 43.71], [-79.7, 43.7]]] } };
  assert.ok(M.eaDashed(traced));
  assert.match(M.eaScopeHTML(traced, {}), /Traced from the project map — approximate/);
  assert.match(M.eaScopeHTML(traced, {}), /Location: traced from the project page image \(3 control points, residual 22 m\)/);
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
  // Two overlapping EA study areas: both are areas, so the list is shown and the second is reachable.
  hits = [{ kind: 'area', key: 'a1', d: 0, label: 'EA study area: A', open: () => opened.push('a1') }, { kind: 'area', key: 'a2', d: 0, label: 'EA study area: B', open: () => opened.push('a2') }];
  P.at(ev(700, 700));
  assert.equal(popups.length, 2, 'overlapping study areas get the picker');
  assert.match(popups[1].html, /EA study area: B/);
  assert.deepEqual(opened, ['ea1', 'only']);
});

test('EA / capital scope: hover previews use their own layer; a replacing result clears the selection; DC hits merge by work', () => {
  const c = src('js/capital-ea.js'), s = src('js/svc-scope.js');
  assert.match(c, /highlight: on => preview\(on, \[e\.geometry\]\)/, 'EA picker rows preview, not select');
  assert.doesNotMatch(c, /highlight: h?on => \(h?on \? highlight\(/, 'no picker row clears the selection layer');
  assert.match(c, /addEventListener\('peel:result-opened'/);
  assert.match(s, /new CustomEvent\('peel:result-opened', \{ detail: \{ ref \} \}\)/);
  assert.match(c, /prev = out\.find\(h => h\.key === k\)/, 'one DC hit per component');
  assert.match(c, /return r\.ok \? await r\.json\(\) : null/, 'a malformed file is caught');
});

test('wiring: scripts, offline cache, Layers switches, year re-render, legend, trail group, Esc, issue title', () => {
  const html = src('index.html'), sw = src('sw.js');
  for (const f of ['capital-ea-model', 'map-pick', 'capital-ea']) {
    assert.match(html, new RegExp(`<script src="js/${f}\\.js\\?v=__BUILD__"></script>`));
    assert.match(sw, new RegExp(`'js/${f}\\.js',`));
  }
  // Layers › Infrastructure (js/layer-groups.js): the two rows, their filters in the group.
  const LG = require('../js/layer-groups.js');
  assert.equal(LG.groupOf('cons'), 'infra'); assert.equal(LG.LAYER.get('cons').label, 'Planned & under construction');
  assert.equal(LG.groupOf('ea'), 'infra'); assert.equal(LG.LAYER.get('ea').label, 'EAs');
  assert.ok(LG.PRESETS.dc.includes('cons') && LG.PRESETS.dc.includes('ea'), 'the Capital view shows construction and EAs');
  assert.ok(LG.Z.infra < LG.Z.eas && LG.Z.eas < LG.Z.overlay, 'EAs draw above the works, under the developments');
  const mm = src('js/map-markers.js');
  assert.match(mm, /id=\\"ce-settings\\"|id="ce-settings"/);
  const ma = src('js/map-analysis.js');
  assert.match(ma, /function renderCapLayer\(\) \{[\s\S]{0,200}PeelCapitalEA\.renderIfChanged\(\)/, 'redrawn on a year change, not on every pan');
  assert.match(ma, /PeelCapitalEA\.legendHTML\(\)/);
  assert.match(src('js/svc-scope.js'), /const g = s\.result && s\.result\.group;/);
  // Share links re-open an EA or capital project scope.
  assert.match(src('js/share.js'), /\(pipe\|file\|dcwork\|iiblock\|ea\|cap\)/);
  assert.match(src('js/svc-scope.js'), /ea: id => \{ const C = window\.PeelCapitalEA;/);
  assert.match(src('js/capital-ea.js'), /\{ group: 'EA', ref: `ea:\$\{e\.id\}` \}/);
  assert.match(src('js/topbar.js'), /steps\.push\(\.\.\.\[\]\.concat\(tc\)\)/);
  assert.match(src('js/capital-ea.js'), /e\.key !== 'Escape'[\s\S]{0,200}closeResult\(\)/);
  assert.match(src('js/map-pick.js'), /closest\('\.leaflet-marker-icon, path\.leaflet-interactive'\)/);
  const RI = require('../js/report-issue.js');
  assert.equal(RI.issueTitle({ kind: 'ea', ref: 'Bolton', municipality: 'Caledon' }), 'Data issue: EA Bolton (Caledon)');
  assert.equal(RI.issueTitle({ kind: 'capital', ref: '22-2300' }), 'Data issue: Capital project 22-2300');
  assert.equal(RI.issueTitle({ kind: 'permit', ref: 'P1' }), 'Data issue: Permit P1');
});

test('new colours are tokens, distinct from phases, capacity, selection and the constraint layers', () => {
  const css = src('css/app.css');
  const blocks = [css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: light)')), css.slice(css.indexOf('@media (prefers-color-scheme: light)'), css.indexOf(':root[data-theme="light"]')), css.slice(css.indexOf(':root[data-theme="light"]'))];
  for (const b of blocks) for (const t of ['--cons-build', '--cons-plan', '--ea-line']) assert.match(b, new RegExp(`${t}: #[0-9a-f]{6};`), t);
  const val = (b, t) => (new RegExp(`${t}: (#[0-9a-f]{6});`).exec(b) || [])[1];
  for (const b of blocks) {
    const reserved = ['--ph-inception', '--ph-review', '--ph-approved', '--ph-permit', '--ph-construction', '--ph-completed', '--ph-cancelled', '--cap-over', '--cap-tight', '--cap-room', '--select', '--cx-reg', '--cx-flood', '--cx-greenbelt', '--cx-orm', '--cx-nep', '--cx-natural', '--cx-nhs', '--cx-water', '--cx-gas', '--cx-hydro'].map(t => val(b, t)).filter(Boolean);
    for (const t of ['--cons-build', '--cons-plan', '--ea-line']) assert.equal(reserved.includes(val(b, t)), false, `${t} reuses a reserved colour`);
  }
  assert.doesNotMatch(src('js/capital-ea.js') + src('js/map-pick.js') + src('js/capital-ea-model.js'), /#[0-9a-fA-F]{6}\b/, 'no hard-coded colours');
});

// ---- Capital tab, DC timing status, This week, Needs attention ----------------------------------
const dcInfra = JSON.parse(src('data/dc-infra.json'));

test('DC timing: actual status where matched, "not in capital records (DC schedule)" otherwise', () => {
  const idx = M.dcCapitalIndex(sample, dcInfra);
  assert.deepEqual(idx.get('24-1192'), { status: 'under construction', percent: 60, lastUpdate: '2026-09-30', key: 'web:peelregion.ca/construction/project-90-0001' });
  assert.match(M.dcActualHTML(idx.get('24-1192'), true), /60% built<\/button> as of Sep 30, 2026/);
  assert.match(M.dcActualHTML(undefined, true), /not in capital records \(DC schedule\)/);
  assert.equal(M.dcActualHTML(undefined, false), '', 'nothing when capital data is not published');
  assert.match(M.dcActualHTML({ status: 'tendered', percent: null, lastUpdate: '2026-08-01', key: 'k' }, true), />Tendered</);
});

test('Capital tab lists: active construction, current EAs, recently completed EAs; municipality scope', () => {
  const cs = M.contracts(sample.records);
  assert.deepEqual(M.activeConstruction(cs).map(c => c.key), ['web:peelregion.ca/construction/project-90-0001']);
  assert.equal(M.activeConstruction(cs, 'Mississauga').length, 0, 'scoped to a municipality');
  const list = [
    { id: 'a', name: 'A', status: 'consultation', municipality: 'Brampton', nextStep: { text: 'PIC', date: '2026-11-20' } },
    { id: 'b', name: 'B', status: 'commenced', municipality: 'Caledon', nextStep: { text: 'Comment period ends', date: '2026-10-23' } },
    { id: 'c', name: 'C', status: 'complete', completedYear: 2025, municipality: 'Brampton' },
    { id: 'd', name: 'D', status: 'complete', completedYear: 2019, municipality: 'Brampton' },
    { id: 'e', name: 'E', status: 'unknown', municipality: 'Brampton' },
  ];
  assert.deepEqual(M.currentEAs(list).map(e => e.id), ['b', 'a'], 'soonest next step first');
  assert.deepEqual(M.currentEAs(list, 'Brampton').map(e => e.id), ['a']);
  assert.deepEqual(M.recentEAs(list, null, 2026).map(e => e.id), ['c'], `completed in the last ${M.RECENT_YEARS} years`);
  const html = M.listsHTML({ contracts: cs, eas: list, thisYear: 2026, hasCapital: true, capitalAsOf: '2026-09-30', screenNote: SCREEN });
  assert.deepEqual(order(html), ['active'], 'Construction lists capital projects; the EAs are on Capital › EAs');
  assert.match(html, /data-ce-goto="eas"/);
  assert.match(html, /General screening results only/);
  assert.match(html, /data-ce-open="cap:web:peelregion\.ca\/construction\/project-90-0001"/);
  assert.match(M.listsHTML({ contracts: new Map(), eas: list, thisYear: 2026, hasCapital: false }), /not published yet/);
});

test('This week: capital changes and EA page changes, watched first', () => {
  const eaData = { changes: [{ id: 'x', name: 'Bolton EA', change: 'new notice: Notice of Completion', date: '2026-10-19' }] };
  const items = M.weekItems(sample, eaData, new Set());
  assert.deepEqual(items.map(i => i.kind), ['ea', 'capital'], 'newest first');
  const w = M.weekItems(sample, eaData, new Set(['cap:web:peelregion.ca/construction/project-90-0001']));
  assert.equal(w[0].kind, 'capital', 'watched first');
  assert.equal(w[0].watched, true);
  assert.match(M.weekHTML(w), /★ Watermain · Sample Watermain Rd/);
  assert.match(M.weekHTML(w), /Start target 2026-01-01 → 2026-02-01/);
  const rows = M.watchRows(['ea:' + eas.eas[0].id, 'cap:web:peelregion.ca/construction/project-90-0001', 'some-dev-key'], sample, eas);
  assert.equal(rows.length, 2, 'development keys are left to the development watchlist');
});

test('Needs attention: EA periods closing in 30 days; DC-matched capital dates moved later', () => {
  const eaData = { eas: [
    { id: 'soon', name: 'Soon EA', milestones: [{ type: 'commentEnd', date: '2026-10-23' }] },
    { id: 'later', name: 'Later EA', milestones: [{ type: 'reviewEnd', date: '2026-12-31' }] },
    { id: 'past', name: 'Past EA', milestones: [{ type: 'reviewEnd', date: '2026-10-01' }] },
  ] };
  const items = M.attentionItems(sample, eaData, '2026-10-15');
  assert.deepEqual(items.map(i => i.ce), ['ea:soon', 'cap:web:peelregion.ca/construction/project-90-0001']);
  assert.match(items[0].text, /EA comment period closes Oct 23, 2026: Soon EA/);
  assert.match(items[1].text, /DC project 90-0001: capital dates moved 1 month later since last week/);
  // needsAttention keeps them, after stalled sites and before this week's changes.
  const all = fs.readdirSync(path.join(__dirname, '..', 'js')).map(f => src(`js/${f}`)).join('\n');
  const m = /const needsAttention = \(d\) => \{[\s\S]*?\n  \};/.exec(all);
  const needsAttention = new Function(`${m[0]}; return needsAttention;`)();
  const out = needsAttention({ stalled: [{ key: 's', units: 300, years: '3 yrs', title: 'T', unitsTxt: '300', muni: 'B' }], ce: items, changes: [{ key: 'k', text: 'New' }] });
  assert.deepEqual(out.map(i => i.ce || i.dev), ['s', 'ea:soon', items[1].ce, 'k']);
  assert.match(src('js/overview-tab.js'), /data-ce-open="\$\{esc\(it\.ce\)\}"/);
});

test('Capital tab: Projects and EAs views (public too), screening note in This week', () => {
  const html = src('index.html');
  assert.match(html, /id="ftab-dca"[^>]*>Capital</);
  assert.match(html, /data-dcasub="projects">Projects</);
  assert.match(html, /data-dcasub="eas">EAs</);
  assert.match(html, /id="pane-dca-build" data-pane="dca" data-sub="projects"/);
  assert.match(html, /id="pane-dca-eas" data-pane="dca" data-sub="eas"/);
  assert.match(html, /id="ce-week-panel"[\s\S]{0,400}General screening results only/);
  // Only Funding is held back in the public version (and behind its Labs switch).
  assert.match(src('js/analysis-tabs.js'), /tab === 'dca' && sub === 'funding' && \(!labOn\('funding'\) \|\| isPublic\(\)\)/);
  assert.match(src('js/overview-tab.js'), /dca: 'Capital'/);
  assert.match(src('js/dca-tab.js'), /PeelCapitalEA\.dcActualHTML\(/);
});

test('DC facility panel lists its EAs (linked items or an EA placed on the facility)', () => {
  const m = (a, b) => Math.hypot((a[0] - b[0]) * 80000, (a[1] - b[1]) * 111000);
  const fc = { name: 'G.E. Booth Water Resource Recovery Facility', g: [-79.546, 43.58] };
  const list = [
    { id: 'booth', name: 'G.E. Booth WWTP', status: 'complete', completedYear: 2011, related: { dcProjects: [{ facility: fc.name, proj: '26-2563' }] } },
    { id: 'near', name: 'Site EA', status: 'consultation', geomType: 'facility', geometry: { type: 'Point', coordinates: [-79.5462, 43.5801] }, related: {} },
    { id: 'far', name: 'Far EA', status: 'complete', geomType: 'facility', geometry: { type: 'Point', coordinates: [-79.7, 43.7] }, related: {} },
  ];
  assert.deepEqual(M.easForDc(fc, list, m).map(e => e.id), ['booth', 'near']);
  assert.match(M.easForDcHTML(M.easForDc(fc, list, m)), /data-ce-open="ea:booth"[\s\S]*completed 2011/);
  assert.equal(M.easForDcHTML([]), '');
  assert.match(src('js/dc-infra.js'), /PeelCapitalEA\.easForDcHTML\(fc\)/);
});

test('exports: Capital and EA sheets, GeoJSON for both layers, no people; capital offered only when published', () => {
  const recs = sample.records;
  const cs = M.contracts(recs);
  const sh = M.capitalSheetRows(cs);
  assert.equal(sh.cols.length, sh.rows[0].length);
  assert.ok(sh.rows.length === cs.size && sh.rows.some(r => r.includes('Under construction') || r.includes('under construction')));
  const ea = M.eaSheetRows(eas.eas);
  assert.equal(ea.rows.length, eas.eas.length);
  const fc = M.capitalGeoJSON(recs, { screening: SCREEN });
  const fe = M.easGeoJSON(eas.eas, { screening: SCREEN });
  assert.equal(fc.properties.screening, SCREEN); assert.equal(fe.features.length, eas.eas.filter(e => e.geometry).length);
  const people = /ProjectManager|Inspector|Contractor|ContractAdmin|Consultant|Conflict|Comments|AssignmentID/i;
  for (const s of [JSON.stringify(sh), JSON.stringify(ea), JSON.stringify(fc), JSON.stringify(fe)]) assert.doesNotMatch(s, people);
  assert.match(src('js/exports.js'), /PeelCapitalEA\.workbookSheets\(\)/);
  assert.match(src('js/topbar.js'), /window\.PeelCapitalEA\.data\.capital \? '<button type="button" role="menuitem" data-tbx="cons">/);
  assert.match(src('js/topbar.js'), /data-tbx="eas">Environmental assessments \(GeoJSON\)/);
});

test('internal: a completed EA near or past 10 years with no linked construction says a review may be required (hidden publicly)', () => {
  const base = { id: 'x', name: 'X', status: 'complete', completedYear: 2015, milestones: [], links: {}, related: {} };
  assert.deepEqual(M.eaReview(base, [], 2026), { level: 'past', years: 11 });
  assert.deepEqual(M.eaReview({ ...base, completedYear: 2017 }, [], 2026), { level: 'approaching', years: 9 });
  assert.equal(M.eaReview({ ...base, completedYear: 2020 }, [], 2026), null);
  assert.equal(M.eaReview(base, [{ rec: { status: 'under construction' } }], 2026), null, 'construction under way: no note');
  assert.equal(M.eaReview({ ...base, status: 'consultation' }, [], 2026), null);
  const html = M.eaScopeHTML(base, { thisYear: 2026 });
  assert.match(html, /class="small pv-hide ce-review"/);
  assert.match(html, /a review may be required/);
  assert.match(html, /Municipal Project Assessment Process \(O\. Reg\. 258\/26\)/);
});
