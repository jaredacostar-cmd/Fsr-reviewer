'use strict';
/* Local sewers (under 300 mm) near the developments: data/sewers-local.json, written by
 * scripts/build-sewer-capacity.js (step 5) from the Region's wastewater mains, for picking a
 * development's outlet (QA/QC › Review outlets, js/dev-outlets.js). The app side is checked in the
 * browser (tests/browser/run.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { localSewers, devPoints, MIN_D } = require('../scripts/build-sewer-capacity.js');

const KX = 80500, KY = 111000, toM = ([x, y]) => [x * KX, y * KY];
const main = (d, g, extra = {}) => ({ b: extra.b || 'SMH2', f: { g, p: { Diameter: d, MainType: extra.type || 'GM', InstallationDate: Date.UTC(2004, 5, 1), InvertUp: 180.2, InvertDown: 179.9 } } });

test('devPoints: developments in the pipeline only (not built, not cancelled, adding homes or a building)', () => {
  const pts = devPoints([
    { lat: 43.7, lng: -79.7, phase: 'review', units: 10 },
    { lat: 43.7, lng: -79.7, phase: 'completed', units: 10 },
    { lat: 43.7, lng: -79.7, phase: 'cancelled', units: 10 },
    { lat: 43.7, lng: -79.7, phase: 'permit', newBuild: true },
    { lat: 43.7, lng: -79.7, phase: 'permit' },
    { phase: 'review', units: 5 },
  ]);
  assert.equal(pts.length, 2);
});

test('localSewers: gravity mains under 300 mm near a development, each with the trunk it drains to', () => {
  const dev = toM([-79.7, 43.7]);
  const near = [[-79.7005, 43.7], [-79.7, 43.7005]], far = [[-79.75, 43.75], [-79.751, 43.75]];
  const list = [main(200, near), main(250, far), main(375, near), main(150, near, { type: 'FM' }), main(200, near, { b: 'SMH9' })];
  const into = b => (b === 'SMH2' ? 7 : -1);
  const out = localSewers(list, { devs: [dev], into, r: 300 });
  assert.equal(out.length, 2, 'the far one, the trunk-sized one and the force main are left out');
  const [d, yr, up, dn, to, c] = out[0];
  assert.deepEqual([d, yr, up, dn, to], [200, 2004, 180.2, 179.9, 7]);
  assert.deepEqual(c, [-7970050, 4370000, -7970000, 4370050], 'coords × 1e5, upstream first');
  assert.equal(out[1][4], -1, 'no trunk found downstream');
  assert.ok(MIN_D === 300);
});

test('wired in: the build writes it, the sewer-build run commits it, the app reads it', () => {
  const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(src('scripts/build-sewer-capacity.js'), /sewers-local\.json/);
  assert.match(src('.github/workflows/probe-sources.yml'), /git add data\/sewers\.json data\/sewers-local\.json/);
  assert.match(src('js/sewer-cap.js'), /fetch\('data\/sewers-local\.json'/);
  assert.ok(JSON.parse(src('data/sources.json')).files['sewers-local.json'].optional, 'optional until the first sewer-build run');
});
