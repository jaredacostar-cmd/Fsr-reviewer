// The lidar elevation sampler (js/elevation.js): lidar first, terrain tiles where it has no value,
// the source on every result, and the benchmark check.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const EL = require('../js/elevation.js');
const FX = require('./fixtures/elevation-benchmarks.json');

const now = fn => fn();   // no deferral in tests: the batch goes out at once
// A lidar stub covering points north of a latitude (the lake shore at Port Credit, say).
const lidarNorthOf = (lat0, calls = []) => async pts => { calls.push(pts.length); return pts.map(p => p.lat >= lat0 ? { z: 100 + (p.lat - lat0) * 1000, res: 0.5, project: 'GTA 2014-18' } : null); };
const terrain = async (lat) => 90 + lat % 1;

test('lidar values come with their source, resolution and project', async () => {
  const s = EL.makeSampler({ lidar: lidarNorthOf(43.5), terrain, defer: now });
  const r = await s.getGround(43.6, -79.6);
  assert.strictEqual(r.source, 'lidar');
  assert.strictEqual(r.res, 0.5);
  assert.strictEqual(r.project, 'GTA 2014-18');
  assert.match(r.label, /lidar terrain model \(GTA 2014-18, 0\.5 m\)/);
});

test('falls back to terrain tiles where the lidar has no value', async () => {
  const s = EL.makeSampler({ lidar: lidarNorthOf(43.5), terrain, defer: now });
  const r = await s.getGround(43.4, -79.6);
  assert.strictEqual(r.source, 'terrain');
  assert.strictEqual(r.res, 7);
  assert.ok(Math.abs(r.z - (90 + 43.4 % 1)) < 1e-9);
  assert.match(r.label, /terrain tiles/);
});

test('falls back to terrain tiles when the lidar service does not answer', async () => {
  const s = EL.makeSampler({ lidar: async () => { throw new Error('503'); }, terrain, defer: now });
  const rs = await s.getGroundMany([{ lat: 43.6, lng: -79.6 }, { lat: 43.7, lng: -79.7 }]);
  assert.deepStrictEqual(rs.map(r => r.source), ['terrain', 'terrain']);
  assert.strictEqual(s.stats.lidarFailures, 1);
  assert.match(EL.sourcesNote(rs), /lidar terrain model had no value/);
});

test('no value from either source: z is null, labelled unavailable, and elevAt rejects', async () => {
  const s = EL.makeSampler({ lidar: async pts => pts.map(() => null), terrain: async () => { throw new Error('no tile'); }, defer: now });
  const r = await s.getGround(43.6, -79.6);
  assert.strictEqual(r.z, null);
  assert.strictEqual(r.label, 'unavailable');
  await assert.rejects(s.elevAt(43.6, -79.6));
  assert.match(EL.sourcesNote([r]), /unavailable/);
});

test('single calls in the same tick go out as one lidar request; repeats come from the cache', async () => {
  const calls = [], queue = [];
  const s = EL.makeSampler({ lidar: lidarNorthOf(43.5, calls), terrain, defer: fn => queue.push(fn) });
  const ps = [43.6, 43.61, 43.62].map(lat => s.getGround(lat, -79.6));
  queue.splice(0).forEach(fn => fn());
  await Promise.all(ps);
  assert.deepStrictEqual(calls, [3]);
  const again = s.getGround(43.6, -79.6); queue.splice(0).forEach(fn => fn()); await again;
  assert.deepStrictEqual(calls, [3], 'cached');
});

test('long lines are sent in chunks', async () => {
  const calls = [];
  const s = EL.makeSampler({ lidar: lidarNorthOf(43.5, calls), terrain, defer: now, chunk: 60 });
  await s.getGroundMany(Array.from({ length: 130 }, (_, i) => ({ lat: 43.6 + i * 1e-4, lng: -79.6 })));
  assert.deepStrictEqual(calls, [60, 60, 10]);
});

test('parseSamples: string values, points left out off the coverage, and the all-miss error', () => {
  // The service's own answers (data/probe/elevation-bench.json): a lake-to-land transect and a mixed pair.
  const mixed = EL.parseSamples({ samples: FX.mixed.samples.map(s => ({ locationId: s.id, value: s.value, attributes: { Project: s.project, Resolution_m: s.res } })) }, 2);
  assert.ok(mixed[0] && Math.abs(mixed[0].z - 85.02) < 0.01 && mixed[0].project === 'GTA 2014-18');
  assert.strictEqual(mixed[1], null, 'the offshore point is left out: no value');
  assert.deepStrictEqual(EL.parseSamples({ error: { code: 400, message: 'Invalid or missing input parameters.' } }, 2), [null, null]);
  assert.deepStrictEqual(EL.parseSamples({ samples: [{ locationId: 0, value: 'NoData' }] }, 1), [null]);
});

test('a profile changes its source label at the edge of the lidar coverage', async () => {
  const s = EL.makeSampler({ lidar: lidarNorthOf(43.55), terrain, defer: now });
  const pts = Array.from({ length: 11 }, (_, i) => ({ d: i * 100, lat: 43.50 + i * 0.01, lng: -79.585 }));
  const g = await s.getGroundMany(pts);
  const prof = pts.map((p, i) => ({ ...p, ...g[i] }));
  const runs = EL.sourceRuns(prof);
  assert.deepStrictEqual(runs.map(r => r.source), ['terrain', 'lidar']);
  assert.deepStrictEqual(runs.map(r => r.label), ['terrain tiles ~7 m', 'lidar 0.5 m']);
  assert.strictEqual(runs[0].to, 400); assert.strictEqual(runs[1].from, 500);
  assert.strictEqual(runs[1].project, 'GTA 2014-18');
  assert.match(EL.sourcesNote(prof), /for 55% of points; terrain tiles .* for the rest/);
  // The project changing inside the lidar coverage is a new run too.
  const two = prof.map(p => p.source === 'lidar' && p.d >= 800 ? { ...p, project: 'GTA 2023' } : p);
  assert.deepStrictEqual(EL.sourceRuns(two).map(r => r.project), [null, 'GTA 2014-18', 'GTA 2023']);
});

test('measure.js labels each profile and pipe depth with its source', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/measure.js'), 'utf8');
  assert.ok(!/elevation-tiles-prod/.test(src), 'one sampler: no terrain tile code left in measure.js');
  assert.match(src, /sourceRunsHTML\(prof\)/);
  assert.match(src, /EL\(\)\.sourcesNote\(prof\)/);
  assert.match(src, /ground − invert; ground from/);
  for (const f of ['site-context.js', 'sewer-profile.js', 'water-trace.js', 'devtab.js']) {
    const s = fs.readFileSync(path.join(__dirname, `../js/${f}`), 'utf8');
    assert.ok(!/elevation-tiles-prod/.test(s), `${f}: no private terrain sampler`);
    assert.ok(/PeelElevation|groundHTML/.test(s), `${f}: uses the shared sampler`);
  }
});

// ---- Benchmarks ------------------------------------------------------------------------------
// City of Brampton benchmarks are tablets set in walls, on CGVD28. Ground in the lidar's datum
// (CGVD2013) = published elevation − the tablet's stated height above grade + (N28 − N2013).
const ground2013 = b => b.elevation28 - b.aboveGrade + b.shift;

test('a known benchmark is within 0.5 m on lidar (Brampton 544, inspected 2019)', async () => {
  const b = FX.points.find(p => p.monument === '544');
  assert.ok(b, 'fixture has benchmark 544');
  const s = EL.makeSampler({ lidar: async pts => pts.map(() => ({ z: b.lidar, res: 0.5, project: b.project })), terrain, defer: now });
  const r = await s.getGround(b.lat, b.lng);
  assert.strictEqual(r.source, 'lidar');
  const diff = r.z - ground2013(b);
  assert.ok(Math.abs(diff) <= 0.5, `544: lidar ${r.z.toFixed(2)} vs ground ${ground2013(b).toFixed(2)} (CGVD2013), diff ${diff.toFixed(2)} m`);
  // Without the datum shift (about −0.41 m here) the comparison would be off by that much.
  assert.ok(b.shift < -0.3 && b.shift > -0.5);
});

test('across the Brampton benchmarks the lidar ground has no bias beyond 0.25 m', () => {
  const d = FX.points.map(b => b.lidar - ground2013(b)).sort((a, b) => a - b);
  assert.ok(d.length >= 100, `${d.length} benchmarks`);
  const median = d[Math.floor(d.length / 2)];
  assert.ok(Math.abs(median) <= 0.25, `median difference ${median.toFixed(3)} m`);
  // Half or more within 0.5 m: tablets sit on walls, culverts and bridges, where the bare-earth
  // pixel at the point can be a metre or more from the grade at the wall.
  const within = d.filter(v => Math.abs(v) <= 0.5).length;
  assert.ok(within / d.length >= 0.5, `${within} of ${d.length} within 0.5 m`);
});

test('hillshade tiles: exportImage with the Hillshade raster function, in Web Mercator', () => {
  const [xmin, ymin, xmax, ymax] = EL.tileBBox(0, 0, 0);
  assert.ok(Math.abs(xmin + 20037508.34) < 1 && Math.abs(ymax - 20037508.34) < 1 && Math.abs(xmax - 20037508.34) < 1 && Math.abs(ymin + 20037508.34) < 1);
  const u = new URL(EL.hillshadeURL(4580, 5980, 14));
  assert.ok(u.pathname.endsWith('/ImageServer/exportImage'));
  assert.deepStrictEqual(JSON.parse(u.searchParams.get('renderingRule')), { rasterFunction: 'Hillshade' });
  assert.strictEqual(u.searchParams.get('bboxSR'), '3857');
  assert.strictEqual(u.searchParams.get('size'), '256,256');
  assert.strictEqual(EL.HILL_MIN_ZOOM, 11);
});

test('the hillshade is a switch, off by default, with its source in the help', () => {
  const mm = fs.readFileSync(path.join(__dirname, '../js/map-markers.js'), 'utf8');
  assert.match(mm, /id="opt-hill"', store\.get\('hillshade', false\) === true/);
  const info = fs.readFileSync(path.join(__dirname, '../js/info.js'), 'utf8');
  assert.match(info, /'hillshade': \{[^\n]*Open Government Licence – Ontario/);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.indexOf('js/elevation.js') > -1 && html.indexOf('js/elevation.js') < html.indexOf('js/measure.js'));
  assert.match(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), /'js\/elevation\.js'/);
});
