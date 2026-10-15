'use strict';
// Constraint layers (Stage 2): the shared geometry, the Site checklist rules, the area card's
// statistics, the build's tiles and grid, and the manifest (source, owner, licence, as-of; sizes).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const G = require('../js/constraint-geo.js');
const CX = require('../js/constraint-data.js');
const B = require('../scripts/build-constraints.js');

const ROOT = path.join(__dirname, '..');
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

// ---- Geometry --------------------------------------------------------------------------------
test('point in polygon is even-odd: a hole is outside', () => {
  const rings = [sq(0, 0, 10, 10), sq(4, 4, 6, 6)];
  assert.ok(G.pointInRings([2, 2], rings));
  assert.ok(!G.pointInRings([5, 5], rings));
  assert.ok(!G.pointInRings([12, 5], rings));
});

test('distances are in metres; inside a polygon is 0', () => {
  const lat = 43.7, kx = 111320 * Math.cos(lat * Math.PI / 180);
  const line = [[-79.7, lat], [-79.7, lat + 0.01]];
  assert.ok(Math.abs(G.distToLine([-79.7 + 50 / kx, lat + 0.005], line) - 50) < 0.5);
  const poly = [sq(-79.71, 43.69, -79.69, 43.71)];
  assert.equal(G.distToRings([-79.7, 43.7], poly), 0);
  assert.ok(Math.abs(G.distToRings([-79.69 + 100 / kx, 43.7], poly) - 100) < 1);
});

test('tiles around a point cover the radius', () => {
  const t = G.tilesAround(-79.7001, 43.7001, 120);
  assert.ok(t.some(([tx, ty]) => tx === Math.floor(-79.7001 / G.TILE) && ty === Math.floor(43.7001 / G.TILE)));
  assert.ok(t.length >= 1 && t.length <= 4);
  assert.equal(G.tilesAround(-79.71, 43.71, 3000).length >= 9, true);
});

test('run-length rows round-trip, and the scanline fills cell centres inside', () => {
  const cells = Uint8Array.from([0, 0, 1, 1, 1, 0, 1, 0, 0, 1]);
  const row = G.encodeFlags(cells);
  assert.deepEqual(row, [2, 3, 1, 1, 2, 1]);
  assert.deepEqual(G.flagIntervals(row), [[2, 5], [6, 7], [9, 10]]);
  assert.deepEqual([...G.valueIntervals(G.encodeValues([0, 1, 1, 2, 2, 2, 0]))], [[1, [[1, 3]]], [2, [[3, 6]]]]);
  const g = { x0: 0, y0: 0, dx: 1, dy: 1, cols: 10, rows: 10 };
  let n = 0; G.scanRings([sq(2, 2, 6, 5)], g, (r, c0, c1) => { n += c1 - c0; });
  assert.equal(n, 4 * 3);
});

test('area statistics: share of the scope flagged, by municipality or by polygon', () => {
  const g = { x0: 0, y0: 0, dx: 1, dy: 1, cols: 10, rows: 10, cellM2: 625, munis: ['A', 'B'], layers: ['reg'], muni: [], reg: [] };
  for (let r = 0; r < 10; r++) {
    g.muni.push(G.encodeValues(Array.from({ length: 10 }, (_, c) => (c < 5 ? 1 : 2))));
    g.reg.push(G.encodeFlags(Array.from({ length: 10 }, (_, c) => (c >= 3 && c < 7 ? 1 : 0))));
  }
  const a = G.areaStats(g, { muni: 1 });
  assert.equal(a.cells, 50); assert.equal(a.by.reg, 20); assert.equal(Math.round(a.pct.reg), 40);
  const p = G.areaStats(g, G.scanUnion([[sq(0, 0, 4, 10)], [sq(2, 0, 6, 10)]], g));
  assert.equal(p.cells, 60); assert.equal(p.by.reg, 30);
  assert.deepEqual(G.flagsAt(g, 3.5, 5.5), { reg: true });
  assert.deepEqual(G.flagsAt(g, 1.5, 5.5), { reg: false });
  assert.equal(G.flagsAt(g, 20, 5), null);
});

// ---- The Site checklist ------------------------------------------------------------------------
const PT = [-79.7, 43.7];
const kx = 111320 * Math.cos(43.7 * Math.PI / 180);
const around = (m, w = 0.0004) => sq(PT[0] - w, PT[1] - w, PT[0] + w, PT[1] + w).map(([x, y]) => [x + m / kx, y]);
const ALL_IDS = ['reg-cvc', 'reg-trca', 'flood-cvc', 'flood-trca', 'greenbelt', 'orm', 'nep', 'psw', 'ansi', 'wc-peel', 'wc-ohn'];
const empty = () => Object.fromEntries(ALL_IDS.map(id => [id, { ok: true, feats: [] }]));
const poly = (label, rings) => ({ label, polys: [rings], lines: null });
const line = (label, l) => ({ label, polys: null, lines: [l] });

test('the checklist has one line per check and is never blank', () => {
  const lines = CX.evaluateSite(PT, empty());
  assert.deepEqual(lines.map(l => l.key), ['reg', 'flood', 'plan', 'natural', 'source', 'water']);
  for (const l of lines) assert.ok(l.text.length > 10 && ['flag', 'near', 'clear', 'np', 'na'].includes(l.status), l.text);
  assert.deepEqual(lines.map(l => l.status), ['clear', 'clear', 'clear', 'clear', 'np', 'clear']);
});

test('inside a regulation limit and floodplain: flagged, naming the authority, in screening words', () => {
  const near = empty();
  near['reg-trca'].feats = [poly(['Regulated area', 'TRCA regulation limit'], [around(0)])];
  near['flood-cvc'].feats = [poly(['Fletchers Creek', 'Regulatory floodplain (CVC)'], [around(0)])];
  const [reg, flood] = CX.evaluateSite(PT, near);
  assert.equal(reg.status, 'flag');
  assert.match(reg.text, /^Inside a mapped regulation limit \(TRCA\) \(screening; confirm with Toronto and Region Conservation Authority\)$/);
  assert.equal(flood.status, 'flag');
  assert.match(flood.text, /Inside a mapped floodplain \(CVC regulatory floodlines\): Fletchers Creek \(screening/);
  assert.deepEqual(reg.sources, ['reg-trca']);
});

test('provincial plans and PSW / ANSI within 120 m', () => {
  const near = empty();
  near.greenbelt.feats = [poly(['Greenbelt: Protected Countryside', 'Greenbelt Plan designation'], [around(0)])];
  near.psw.feats = [poly(['Provincially significant wetland', 'Wetland'], [around(80 + 0.0004 * kx, 0.0004)])];
  near.ansi.feats = [poly(['Credit River Valley', 'ANSI'], [around(500)])];
  const lines = CX.evaluateSite(PT, near);
  const plan = lines.find(l => l.key === 'plan'), nat = lines.find(l => l.key === 'natural');
  assert.equal(plan.status, 'flag'); assert.match(plan.text, /Greenbelt: Protected Countryside/);
  assert.equal(nat.status, 'flag'); assert.match(nat.text, /Provincially significant wetland within 8\d m/);
  assert.doesNotMatch(nat.text, /ANSI/, 'the ANSI 500 m away is not listed');
});

test('watercourses: within 30 m is flagged, within 120 m is nearby, beyond is clear', () => {
  const at = m => { const near = empty(); near['wc-ohn'].feats = [line(['Etobicoke Creek', 'Stream'], [[PT[0] + m / kx, PT[1] - 0.01], [PT[0] + m / kx, PT[1] + 0.01]])]; return CX.evaluateSite(PT, near).find(l => l.key === 'water'); };
  const a = at(20), b = at(90), c = at(200);
  assert.equal(a.status, 'flag'); assert.match(a.text, /^Watercourse within 30 m: Etobicoke Creek, about 20 m/);
  assert.equal(b.status, 'near'); assert.match(b.text, /^Watercourse within 120 m: Etobicoke Creek, about 90 m/);
  assert.equal(c.status, 'clear');
});

test('north Caledon (NVCA): regulation limit and floodplain read "not published", not clear', () => {
  const near = empty();
  near['wc-peel'].feats = [line(['Humber River', 'Humber watershed · NVCA', 'NVCA'], [[PT[0] + 500 / kx, PT[1] - 0.01], [PT[0] + 500 / kx, PT[1] + 0.01]])];
  const [reg, flood] = CX.evaluateSite(PT, near);
  assert.equal(reg.status, 'np'); assert.match(reg.text, /not published for the Nottawasaga Valley Conservation Authority area \(north Caledon\)/);
  assert.equal(flood.status, 'np');
  // A mapped CVC / TRCA limit still wins where it exists.
  near['reg-cvc'].feats = [poly(['Regulated area', 'CVC'], [around(0)])];
  assert.equal(CX.evaluateSite(PT, near)[0].status, 'flag');
});

test('a layer that did not load reads "not checked", never blank or clear', () => {
  const near = empty(); near['reg-cvc'] = { ok: false, feats: [] }; near.psw = { ok: false, feats: [] };
  const lines = CX.evaluateSite(PT, near);
  assert.equal(lines[0].status, 'na'); assert.match(lines[0].text, /not checked \(reg-cvc did not load\)/);
  assert.equal(lines.find(l => l.key === 'natural').status, 'na');
});

test('source protection is always a "not published" line (decision 2)', () => {
  const l = CX.evaluateSite(PT, empty()).find(x => x.key === 'source');
  assert.equal(l.status, 'np'); assert.match(l.text, /not included in this app; check the CTC Source Protection Region maps/);
});

test('checklist and card wording stays screening: no determinations', () => {
  const near = empty();
  near['reg-cvc'].feats = [poly(['Regulated area', 'CVC'], [around(0)])];
  const html = CX.checklistHTML(CX.evaluateSite(PT, near), null);
  assert.match(html, /not an official determination/i);
  assert.equal((html.match(/cx-basis/g) || []).length, 1, 'one basis line');
  for (const re of [/\bis regulated\b/i, /\bnot regulated\b/i, /\bpermit (is )?required\b/i, /\bcannot be developed\b/i, /\bprohibited\b/i]) assert.doesNotMatch(html, re);
  const src = fs.readFileSync(path.join(ROOT, 'js/constraint-data.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'js/constraints.js'), 'utf8');
  for (const re of [/'[^']*\bis regulated\b[^']*'/i, /\bnot regulated\b/i, /\bcannot be developed\b/i]) assert.doesNotMatch(src, re);
});

test('area rows: shares and the developments whose point is inside', () => {
  const g = { x0: 0, y0: 0, dx: 1, dy: 1, cols: 4, rows: 1, cellM2: 625, cellM: 25, munis: ['A'], layers: ['reg', 'flood', 'plan'], muni: [[1, 4]], reg: [[0, 2]], flood: [[3, 1]], plan: [] };
  const st = G.areaStats(g, { muni: 1 });
  const rows = CX.areaRows(st, [{ key: 'a', lng: 0.5, lat: 0.5 }, { key: 'b', lng: 3.5, lat: 0.5 }, { key: 'c', lng: null, lat: null }], g);
  assert.deepEqual(rows.map(r => [r.k, Math.round(r.pct), r.devs]), [['reg', 50, ['a']], ['flood', 25, ['b']], ['plan', 0, []]]);
  const html = CX.areaCardHTML('A', st, rows, g);
  assert.match(html, /Land under constraints/); assert.match(html, /data-cx-devs="reg">1</); assert.match(html, /25 m grid/);
});

// ---- The build ---------------------------------------------------------------------------------
test('the build cuts a feature into tiles, keeps holes with their polygon, and only where Peel has land', () => {
  const d = { id: 't', kind: 'area', label: a => [a.n, 'type'] };
  const outer = sq(-79.735, 43.705, -79.705, 43.735), hole = sq(-79.725, 43.715, -79.715, 43.725);
  const mask = new Set([G.tileKey(-3987, 2185), G.tileKey(-3986, 2186)]);
  const cut = B.cutTiles(d, [{ attributes: { n: 'A' }, geometry: { rings: [outer, hole] } }], mask);
  assert.deepEqual([...cut.tiles.keys()].sort(), [...mask].sort());
  assert.deepEqual(cut.labels, [['A', 'type']]);
  const t = cut.tiles.get(G.tileKey(-3986, 2186));
  assert.equal(t.p.length, 1); assert.equal(t.p[0][1].length, 2, 'outer and hole together');
  assert.ok(t.e.length);
});

test('the build simplifies closed rings for the overview (not to nothing)', () => {
  const ring = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * 2 * Math.PI; ring.push([Math.cos(a) * 0.01, Math.sin(a) * 0.01]); }
  const s = B.simplify(ring, 0.0003);
  assert.ok(s.length >= 8 && s.length < ring.length);
});

test('every approved dataset is configured with its owner, licence and source; skipped ones are not', () => {
  const ids = B.DATASETS.map(d => d.id);
  assert.deepEqual(ids, ['reg-cvc', 'reg-trca', 'flood-cvc', 'flood-trca', 'greenbelt', 'orm', 'nep', 'psw', 'ansi', 'nhs', 'wc-peel', 'wc-ohn', 'utility']);
  for (const d of B.DATASETS) {
    assert.match(d.url, /^https:\/\/[^ ]+\/(FeatureServer|MapServer)\/\d+$/, d.id);
    assert.ok(d.owner && d.licence && d.title && d.note, d.id);
  }
  assert.ok(!ids.some(id => /source|swp|nvca/i.test(id)), 'source protection and NVCA are not built');
  assert.match(B.DATASETS.find(d => d.id === 'flood-trca').disclaimer, /generalized representation/);
  assert.match(B.DATASETS.find(d => d.id === 'utility').note, /^Approximate location .*Ontario One Call/);
});

// ---- The built data (data/constraints) ----------------------------------------------------------
const MAN = path.join(ROOT, 'data/constraints/manifest.json');
test('manifest: every dataset has a source, owner, licence and size; no account names', { skip: !fs.existsSync(MAN) }, () => {
  const m = JSON.parse(fs.readFileSync(MAN, 'utf8'));
  assert.equal(m.datasets.length, B.DATASETS.length);
  for (const d of m.datasets) {
    assert.ok(d.url && d.owner && d.licence && d.title, d.id);
    assert.ok(d.asOf === null || /^\d{4}-\d{2}-\d{2}$/.test(d.asOf), d.id);
    assert.ok(d.features > 0 && d.tiles > 0, `${d.id} has features`);
    assert.ok(d.maxTileBytes < 2e6, `${d.id}: a tile under 2 MB`);
    assert.ok(!d.overviewBytes || d.overviewBytes < 1.6e6, `${d.id}: overview under the cap`);
    assert.ok(fs.existsSync(path.join(ROOT, d.path, 'index.json')), d.id);
  }
  assert.deepEqual(m.skipped.map(s => s.id), ['source-protection', 'nvca']);
  assert.ok(m.grid && m.grid.bytes < 2e6 && m.grid.cellM === 25);
  assert.doesNotMatch(fs.readFileSync(MAN, 'utf8'), /"(owner|creator|editor)Name"|@[a-z0-9-]+\.(ca|com)\b/i);
});

test('nothing in the app loads constraint data until a layer is switched on', () => {
  const s = fs.readFileSync(path.join(ROOT, 'js/constraints.js'), 'utf8');
  // Off by default (gas and hydro included), and render returns before any fetch when all are off.
  assert.match(s, /const on = Object\.fromEntries\(Object\.keys\(LAYERS\)\.map\(k => \[k, false\]\)\)/);
  assert.match(s, /if \(!keys\.length\) \{ if \(note\) note\.textContent = ''; return; \}/);
  assert.match(s, /if \(Object\.values\(on\)\.some\(Boolean\)\) map\.whenReady/);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('js/constraint-geo.js') < html.indexOf('js/constraint-data.js') && html.indexOf('js/constraint-data.js') < html.indexOf('js/constraints.js'));
});

test('follows the redesign: one hover card, hatched areas, the stated zoom thresholds', () => {
  const s = fs.readFileSync(path.join(ROOT, 'js/constraints.js'), 'utf8');
  // SPEC §3: one hover card for every feature; click opens the right panel.
  assert.match(s, /window\.PeelUtil\.hoverCard\(\{ kind: `\$\{L0\.label\} · screening`/);
  assert.match(s, /SS\(\)\.openResult\(/);
  // Two ladders: constraint areas are hatched, never a solid colour that reads as phase / capacity.
  assert.match(s, /fillColor: hatch\(col, BACK\.has\(key\)\)/);
  assert.doesNotMatch(s, /fillColor: col\b/);
  // SPEC §4 thresholds (unchanged, stated): gas / hydro from 11, watercourses from 12.
  const C = { gas: /gas: \{[^\n]*minZoom: (\d+)/, hydro: /hydro: \{[^\n]*minZoom: (\d+)/, water: /water: \{[^\n]*minZoom: (\d+)/ };
  assert.equal(+s.match(C.gas)[1], 11); assert.equal(+s.match(C.hydro)[1], 11); assert.equal(+s.match(C.water)[1], 12);
});
