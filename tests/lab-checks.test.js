'use strict';
// Labs: the Gravity check and the Pressure check (js/lab-checks.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LC = require('../js/lab-checks.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('pressure zones 1–7: the Master Plan\'s grade lines and serviceable elevations (Vol. 3, Table 3)', () => {
  assert.deepEqual(LC.ZONES[3], { twl: 205.7, hgl: 213.4, serv: [135.9, 167.6] });
  assert.deepEqual(LC.ZONES[7], { twl: 327.7, hgl: 335.3, serv: [243.4, 289.6] });
  assert.deepEqual(Object.keys(LC.ZONES), ['1', '2', '3', '4', '5', '6', '7']);
  assert.match(LC.ZONE_SRC, /Vol\. 3, Table 3/);
  assert.equal(LC.PRESSURE.min, 40); assert.equal(LC.PRESSURE.max, 100);
});

test('pressure at ground: static head to the grade line, against 40–100 psi, and the storeys at 40 psi', () => {
  const r = LC.pressureAt(150, 3);    // 63.4 m of head
  assert.ok(Math.abs(r.kpa - 63.4 * 9.80665) < 1e-6);
  assert.ok(Math.abs(r.psi - 90.2) < 0.1);
  assert.equal(r.tone, 'room'); assert.equal(r.band, 'within');
  // 40 psi is 28.1 m of head: (63.4 − 28.1) / 3 m → 11 storeys
  assert.equal(r.storeys, 11);
  assert.equal(LC.pressureAt(190, 3).verdict, 'Below 40 psi at ground');
  assert.equal(LC.pressureAt(190, 3).band, 'above');
  assert.equal(LC.pressureAt(120, 3).verdict, 'Above 100 psi at ground');
  // a zone outside the lake-based table (Caledon's groundwater systems, sub-zones): not known
  assert.equal(LC.pressureAt(250, '5A'), null);
});

test('the gravity verdict', () => {
  assert.equal(LC.gravityVerdict({ ok: false, why: 'by gravity the new sewer reaches the connection about 0.7 m below the existing obvert: …' }).text, 'Likely needs pumping');
  assert.equal(LC.gravityVerdict({ ok: true, structures: 0, mhs: [{ depth: 2.7 }, { depth: 4.1 }] }).text, 'Likely by gravity');
  assert.equal(LC.gravityVerdict({ ok: true, structures: 1, mhs: [{ depth: 2.7 }] }).tone, 'tight');
  assert.equal(LC.gravityVerdict(null).text, 'Not assessed');
});

test('wired: two Labs switches; the folds sit in a development\'s Servicing panel; the screening note', () => {
  const L = require('../js/labs.js');
  for (const id of ['gravity', 'pressure']) assert.ok(L.IDS.includes(id), id);
  assert.match(src('js/svc-capacity.js'), /\.\.\.\(root\.PeelLabChecks \? root\.PeelLabChecks\.folds\(p\) : \[\]\),/);
  const s = src('js/lab-checks.js');
  assert.match(s, /if \(on\('gravity'\)\) out\.push\(\{ title: 'Gravity check \(Labs\)'/);
  assert.match(s, /if \(on\('pressure'\)\) out\.push\(\{ title: 'Pressure check \(Labs\)'/);
  assert.match(s, /const NOTE = \(root\.PeelPanel && root\.PeelPanel\.NOTE\) \|\| 'General screening results only\. Peel\\'s W&amp;WW Infrastructure Planning team must validate or confirm all results\.';/);
  assert.match(s, /A straight line from the site's centre: the street route is longer/);
  for (const f of ['js/sewer-design.js', 'js/lab-checks.js']) { assert.ok(src('index.html').includes(`<script src="${f}?v=__BUILD__"></script>`), f); assert.ok(src('sw.js').includes(`'${f}',`), f); }
  assert.match(src('js/measure.js'), /const api = \{ politeFetch, sewerWalk, mainsNear, nearOn,/);
});

test('the gravity verdict reads the depth along the line, not only at the maintenance holes', () => {
  const SD = require('../js/sewer-design.js');
  // a 4 m ridge halfway between two maintenance holes 150 m apart
  const gf = x => 200 - 0.01 * x + 4 * Math.exp(-(((x - 75) / 25) ** 2));
  const route = { nodes: [0, 150].map(x => ({ x, g: gf(x), bend: 0 })), samples: Array.from({ length: 15 }, (_, k) => ({ x: k * 10 + 5, g: gf(k * 10 + 5) })) };
  const d = SD.design(route, { invert: gf(150) - 3, dmm: 375 }, 8);
  assert.ok(d.ok, d.why);
  assert.equal(d.structures, 0);
  assert.ok(Math.max(...d.mhs.map(m => m.depth)) < 6, 'shallow at both maintenance holes');
  assert.ok(Math.abs(LC.deepestOf(d, route) - 6.7) < 1e-6, `${LC.deepestOf(d, route)}`);   // was 2.7 m (the maintenance holes)
  // the maintenance holes alone (as before), then along the line
  assert.equal(LC.gravityVerdict(d).text, 'Likely by gravity');
  assert.equal(LC.gravityVerdict(d, route).text, 'By gravity, deep or with a drop structure');
  assert.match(src('js/lab-checks.js'), /const v = gravityVerdict\(d, route\)/);
});

test('the connection point on the pipe: t is a fraction of the length in metres, not in degrees', () => {
  const lat0 = 43.7, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 111320;
  // a pipe 100 m east, then 100 m north: halfway along is the corner
  const g = [[-79.7, lat0], [-79.7 + 100 / kx, lat0], [-79.7 + 100 / kx, lat0 + 100 / ky]];
  const p = LC.pointAt(g, 0.5), off = Math.hypot((p[0] - g[1][0]) * kx, (p[1] - g[1][1]) * ky);
  assert.ok(off < 0.05, `${off.toFixed(2)} m from the corner`);   // was 13.9 m
  const q = LC.pointAt(g, 0.25);
  assert.ok(Math.abs((q[0] - g[0][0]) * kx - 50) < 0.05 && Math.abs(q[1] - lat0) < 1e-12);
  assert.deepEqual(LC.pointAt(g, 1), g[2]);
  assert.deepEqual(LC.pointAt(g, 0), g[0]);
});
