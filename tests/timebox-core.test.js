'use strict';
// js/timebox-core.js: the Time Box's Wayback releases, dedupe, and applications by filing date (Part 3).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/timebox-core.js');

const layer = (date, id, rel) => `<Layer><ows:Title>World Imagery (Wayback ${date})</ows:Title><ows:Identifier>${id}</ows:Identifier>
  <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style><Format>image/jpeg</Format>
  <ResourceURL format="image/jpeg" resourceType="tile" template="https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${rel}/{TileMatrix}/{TileRow}/{TileCol}"/></Layer>`;
const CAPS = `<?xml version="1.0"?><Capabilities><Contents>${layer('2016-01-13', 'WB_2016_R01', 3)}${layer('2014-02-20', 'WB_2014_R01', 10)}${layer('2019-06-26', 'WB_2019_R08', 7)}<Layer><ows:Title>Not a release</ows:Title></Layer></Contents></Capabilities>`;

test('Wayback capabilities: releases with their date, number and tile template, oldest first', () => {
  const r = T.parseWaybackCapabilities(CAPS);
  assert.deepEqual(r.map(x => [x.date, x.release, x.id, x.year]), [['2014-02-20', 10, 'WB_2014_R01', 2014], ['2016-01-13', 3, 'WB_2016_R01', 2016], ['2019-06-26', 7, 'WB_2019_R08', 2019]]);
  assert.equal(T.WAYBACK.tileURL(r[0], 17, 36600, 47800), 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/10/17/47800/36600');
});

test('dedupe: consecutive releases with the same tiles collapse to the first; failed releases skipped', () => {
  const rel = (date, release) => ({ date, release, year: +date.slice(0, 4) });
  const releases = [rel('2014-02-20', 1), rel('2014-06-01', 2), rel('2015-03-01', 3), rel('2015-09-01', 4), rel('2016-01-01', 5), rel('2016-05-01', 6), rel('2017-01-01', 7)];
  const sig = { 1: 'a', 2: 'a', 3: 'b', 4: 'c', 5: null, 6: 'c', 7: 'a' };
  const d = T.distinctReleases(releases, sig);
  assert.deepEqual(d.map(x => x.release), [1, 3, 4, 7], 'same imagery → one; a failed release does not split a run; a return to old imagery counts');
  const y = T.onePerYear(d);
  assert.deepEqual(y.map(x => [x.year, x.release]), [[2014, 1], [2015, 4], [2017, 7]], 'at most one per year: the latest that year');
});

test('the box: zoom chosen so at most 16 tiles are hashed; cache key per box and zoom', () => {
  const box = [-79.80, 43.72, -79.79, 43.727];
  const z = T.chooseZoom(box);
  assert.ok(T.tilesForBox(box, z).length <= 16);
  assert.ok(z === T.MAX_Z || T.tilesForBox(box, z + 1).length > 16);
  assert.equal(T.chooseZoom([-80, 43, -79, 44]), T.MIN_Z);
  assert.equal(T.cacheKey('wayback', [-79.79, 43.727, -79.8, 43.72], 17, 'r9'), T.cacheKey('wayback', box, 17, 'r9'), 'a box drawn either way is the same box');
  assert.notEqual(T.cacheKey('wayback', box, 17), T.cacheKey('wayback', box, 16));
});

test('pool: at most 6 in flight, all results in order, cancellable', async () => {
  let inFlight = 0, peak = 0;
  const task = async i => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 2)); inFlight--; return i * 2; };
  const out = await T.pool(20, 6, task);
  assert.deepEqual(out, Array.from({ length: 20 }, (_, i) => i * 2)); assert.ok(peak <= 6, `${peak}`);
  const ac = new AbortController(); let started = 0;
  const slow = async () => { started++; if (started === 3) ac.abort(); await new Promise(r => setTimeout(r, 5)); };
  await assert.rejects(T.pool(50, 2, slow, ac.signal), /cancelled/);
  assert.ok(started < 50);
});

test('tile hash: identical bytes → identical hash, different bytes → different', () => {
  const a = Uint8Array.from([1, 2, 3, 4]), b = Uint8Array.from([1, 2, 3, 5]);
  assert.equal(T.hashBytes(a), T.hashBytes(Uint8Array.from([1, 2, 3, 4])));
  assert.notEqual(T.hashBytes(a), T.hashBytes(b));
});

test('applications by filing date: submitted date, else first milestone (filed by), else unknown', () => {
  const box = [-79.8, 43.7, -79.7, 43.8], at = { lat: 43.75, lng: -79.75 };
  const app = (events, extra = {}) => ({ ...at, records: [{ kind: 'application', events }], ...extra });
  const ps = [
    app([{ date: new Date('2018-03-01T00:00:00Z'), phase: 'inception' }, { date: new Date('2019-05-01T00:00:00Z'), phase: 'approved' }], { key: 'a' }),
    app([['2021-02-02', 'approved', 'ApprovalDate']], { key: 'b' }),
    app([], { key: 'c' }),
    app([['2015-01-01', 'inception', 'SubmissionDate']], { key: 'out', lat: 44 }),
    { ...at, key: 'permit-only', records: [{ kind: 'permit', events: [['2010-01-01', 'permit', 'IssueDate']] }] },
  ];
  assert.deepEqual(T.filingDate(ps[0]), { time: Date.parse('2018-03-01T00:00:00Z'), year: 2018, basis: 'filed' });
  assert.equal(T.filingDate(ps[1]).basis, 'by'); assert.equal(T.filingDate(ps[1]).year, 2021);
  assert.equal(T.filingDate(ps[2]).basis, 'unknown');
  const r2019 = T.applicationsAsOf(ps, box, 2019);
  assert.deepEqual(r2019.shown.map(x => x.p.key), ['a']);
  assert.deepEqual(r2019.later.map(x => x.p.key), ['b']);
  assert.deepEqual(r2019.unknown.map(x => x.p.key), ['c'], 'date unknown: flagged, whatever the year');
  assert.deepEqual(T.applicationsAsOf(ps, box, 2017).shown, []);
  assert.deepEqual(T.applicationsAsOf(ps, box, 2022).shown.map(x => x.p.key), ['a', 'b']);
});

test('the slider snaps to the nearest year with imagery', () => {
  assert.equal(T.snapYear([2014, 2017, 2021], 2019), 2017);
  assert.equal(T.snapYear([2014, 2017, 2021], 2020), 2021);
  assert.equal(T.snapYear([], 2020), null);
});

test('bisection finds every change with far fewer checks than releases', async () => {
  // 190 releases; the imagery changes at 30, 31, 95 and 160.
  const truth = i => i < 30 ? 'a' : i < 31 ? 'b' : i < 95 ? 'c' : i < 160 ? 'd' : 'e';
  let calls = 0;
  const { sig, checked } = await T.bisectSignatures(190, async i => { calls++; return truth(i); });
  assert.deepEqual(sig, Array.from({ length: 190 }, (_, i) => truth(i)));
  assert.equal(checked, calls); assert.ok(calls < 60, `${calls} checks`);
  const rel = sig.map((_, i) => ({ release: i, date: `20${String(10 + Math.floor(i / 19)).padStart(2, '0')}-01-01`, year: 2010 + Math.floor(i / 19) }));
  const byRel = Object.fromEntries(sig.map((v, i) => [i, v]));
  assert.deepEqual(T.distinctReleases(rel, byRel).map(r => r.release), [0, 30, 31, 95, 160]);
  // A failed check does not end the search: the range is split around it.
  const r2 = await T.bisectSignatures(10, async i => i === 9 ? null : i < 5 ? 'x' : 'y');
  assert.deepEqual(r2.sig, ['x', 'x', 'x', 'x', 'x', 'y', 'y', 'y', 'y', null]);
});

test('limiter: never more than the limit in flight', async () => {
  const run = T.limiter(6); let peak = 0, now = 0;
  await Promise.all(Array.from({ length: 40 }, () => run(async () => { now++; peak = Math.max(peak, now); await new Promise(r => setTimeout(r, 1)); now--; })));
  assert.ok(peak <= 6 && peak > 1, `${peak}`);
});

test('fallback release list: waybackconfig.json gives the same releases and templates', () => {
  const cfg = { 10: { itemTitle: 'World Imagery (Wayback 2014-02-20)', layerIdentifier: 'WB_2014_R01', itemURL: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/10/{level}/{row}/{col}' }, 3: { itemTitle: 'World Imagery (Wayback 2016-01-13)', itemURL: 'https://x/tile/3/{level}/{row}/{col}' } };
  const a = T.parseWaybackConfig(cfg), b = T.parseWaybackCapabilities(CAPS);
  assert.deepEqual(a.map(r => [r.date, r.release]), [['2014-02-20', 10], ['2016-01-13', 3]]);
  assert.equal(T.WAYBACK.tileURL(a[0], 5, 6, 7), T.WAYBACK.tileURL(b[0], 5, 6, 7));
});

test('a box drawn on a rotated map: only developments inside its outline count', () => {
  // A square turned 45° (a diamond) inside its bbox [-1, -1, 1, 1].
  const ring = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  assert.equal(T.inRing(ring, 0, 0), true);
  assert.equal(T.inRing(ring, 0.9, 0.9), false, 'a bbox corner is outside the turned box');
  assert.deepEqual(T.ringBox(ring), [-1, -1, 1, 1]);
  const app = (key, lat, lng) => ({ key, lat, lng, records: [{ kind: 'application', events: [['2015-01-01', 'inception', 'SubmissionDate']] }] });
  const r = T.applicationsAsOf([app('mid', 0, 0), app('corner', 0.9, 0.9)], [-1, -1, 1, 1], 2020, ring);
  assert.deepEqual(r.shown.map(x => x.p.key), ['mid']);
  assert.deepEqual(T.applicationsAsOf([app('corner', 0.9, 0.9)], [-1, -1, 1, 1], 2020).shown.map(x => x.p.key), ['corner'], 'without a ring, the bbox');
});

test('the drawing rule is cheap: no descendant selectors on the map while drawing', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '../css/app.css'), 'utf8');
  assert.ok(!/\.tb-drawing\s+[*.]/.test(css) && !/\.tb-drawing \*/.test(css), 'a .tb-drawing descendant rule restyles every marker');
});

test('live template with {TileMatrixSet}: filled from the layer, so Leaflet gets only {z}/{y}/{x}', () => {
  const live = `<Capabilities><Contents><Layer><ows:Title>World Imagery (Wayback 2026-04-30)</ows:Title><ows:Identifier>WB_2026_R05</ows:Identifier>
    <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style><Format>image/jpeg</Format>
    <TileMatrixSetLink><TileMatrixSet>default028mm</TileMatrixSet></TileMatrixSetLink>
    <ResourceURL format="image/jpeg" resourceType="tile" template="https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/{TileMatrixSet}/MapServer/tile/49849/{TileMatrix}/{TileRow}/{TileCol}"/></Layer></Contents></Capabilities>`;
  const [r] = T.parseWaybackCapabilities(live);
  assert.equal(r.release, 49849); assert.equal(r.matrixSet, 'default028mm');
  const base = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/49849';
  assert.equal(T.WAYBACK.tileURL(r, 17, 36600, 47800), `${base}/17/47800/36600`);
  assert.equal(T.WAYBACK.leafletTemplate(r), `${base}/{z}/{y}/{x}`);
  // A release list cached before this fix (no matrixSet) still gets Esri's default.
  assert.equal(T.WAYBACK.leafletTemplate({ template: r.template }), `${base}/{z}/{y}/{x}`);
  assert.throws(() => T.WAYBACK.leafletTemplate({ template: 'https://x/{Unknown}/{TileMatrix}/{TileRow}/{TileCol}' }), /cannot fill \(\{Unknown\}\)/);
});
