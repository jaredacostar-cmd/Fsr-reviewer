'use strict';
// Ground elevation against Peel sanitary manholes (Part 1, item 6). The stored table
// (data/elevation-validation.json, read by the accuracy label) must match the errors recomputed from
// the stored manhole sample (tests/fixtures/manhole-sample.json). Raw sources only: the lidar and the
// terrain tiles as sampled, never the manhole-corrected line (it is built from these manholes).
// Both files are rebuilt in Actions (scripts/probe-elev-validate.js); the Elevation validation
// workflow also re-samples the sources live (--check) when the sampler or a source changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../js/profile-core.js');

const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'elevation-validation.json'), 'utf8'));
const FX_FILE = path.join(__dirname, 'fixtures', 'manhole-sample.json');
const FX = fs.existsSync(FX_FILE) ? JSON.parse(fs.readFileSync(FX_FILE, 'utf8')) : null;
const TOL = 0.005;

test('the table names its datums and the lidar target; every area has a bbox', () => {
  assert.match(TABLE.datums.lidar, /CGVD2013/);
  assert.ok(TABLE.datums.peelSewers, 'Peel datum recorded (or "unknown")');
  assert.match(TABLE.lidarTarget, /0\.3 m/);
  for (const [k, a] of Object.entries(TABLE.areas)) { assert.equal(a.bbox.length, 4, k); assert.ok(a.bbox[0] < a.bbox[2] && a.bbox[1] < a.bbox[3], k); }
});

test('the stored error table matches the errors recomputed from the manhole sample (raw sources only)', { skip: !FX && 'no manhole sample yet: rebuilt in Actions (mode=elev-validate)' }, () => {
  assert.equal(FX.peelDatum, TABLE.datums.peelSewers, 'one datum decision for both files');
  const shift = m => (FX.applyShift ? m.shift || 0 : 0);
  for (const [key, a] of Object.entries(TABLE.areas)) {
    const ms = FX.manholes.filter(m => m.area === key);
    for (const src of ['lidar', 'terrain']) {
      const got = C.validationStats(ms.map(m => (m[src] == null ? null : m[src] - (m.invert + m.depth + shift(m)))));
      const row = a.rows[src] || { n: 0 };
      assert.equal(got.n, row.n, `${key} ${src} n`);
      if (!got.n) continue;
      for (const k of ['median', 'medianAbs', 'within05', 'within1']) assert.ok(Math.abs(got[k] - row[k]) <= (k.startsWith('within') ? 0.1 : TOL), `${key} ${src} ${k}: ${got[k]} vs ${row[k]}`);
    }
  }
  // Every manhole in the sample used a published depth between 0.5 and 15 m.
  assert.ok(FX.manholes.every(m => C.depthOk(m.depth)));
});

test('the lidar target (median |error| < 0.3 m, 90% within 0.5 m) is recorded per area', { skip: !FX && 'no manhole sample yet' }, () => {
  for (const [key, a] of Object.entries(TABLE.areas)) {
    const r = a.rows.lidar; if (!r || !r.n) continue;
    assert.equal(r.target, r.medianAbs < 0.3 && r.within05 >= 90 ? 'met' : 'not met', key);
    if (process.env.STRICT_LIDAR) assert.equal(r.target, 'met', `${key}: lidar target`);
  }
});
