'use strict';
// The 3D view (js/view-3d.js): the ground's vertical exaggeration the user picks, the buildings
// across Peel (data/3d/, scripts/build-3d-tiles.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the ground can be exaggerated ×1 to ×5 (×1.2 by default, kept between visits); buildings and proposals keep their true height', () => {
  const s = src('js/view-3d.js');
  assert.match(s, /const EXAGGERATIONS = \[1, 1\.2, 1\.5, 2, 3, 5\];/);
  assert.match(s, /terrain: \{ source: 'dem', exaggeration: exag\(\) \}/);
  assert.match(s, /gl\.setTerrain\(\{ source: 'dem', exaggeration: v \}\)/);
  assert.match(s, /store\.set\('v3Exag', v\)/);
  assert.match(s, /<select data-v3="exag" aria-label="Vertical exaggeration of the ground">/);
  assert.match(s, /Buildings and proposals stand at their true height on the ground, at any exaggeration\./);
  // (the extrusions' heights are not scaled with the ground)
  assert.ok(!/fill-extrusion-height['"]?:\s*\['\*'/.test(s));
});

test('the buildings are built across the Region (cells of Overpass, each building once, inside Peel\'s outline)', () => {
  const b = src('scripts/build-3d-tiles.js');
  assert.match(b, /const PEEL = \{ name: 'Region of Peel', bbox: \[-80\.16, 43\.47, -79\.48, 44\.00\] \}, CELL = 0\.04;/);
  assert.match(b, /const file = 'buildings-peel\.pmtiles';/);
  assert.match(b, /if \(seen\.has\(k\)\) continue;/);
  assert.match(b, /return p && inPeel\(\[p\.lon, p\.lat\]\);/);
  const m = JSON.parse(src('data/3d/manifest.json'));
  if (m.buildings && m.buildings.file === 'buildings-peel.pmtiles') {
    assert.equal(m.buildings.area, 'Region of Peel');
    assert.deepEqual(m.buildings.bbox, [-80.16, 43.47, -79.48, 44.00]);
    assert.ok(m.buildings.count > 100000, `${m.buildings.count} buildings`);
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'data/3d/buildings-pilot.pmtiles')), 'the pilot file is gone');
  }
});
