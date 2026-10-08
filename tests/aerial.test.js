'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/aerial.js');
const CFG = require('../js/config.js');

// w x h test image: fill(x, y) -> [r, g, b]; mask = centre square.
function img(w, h, fill) {
  const rgba = new Uint8ClampedArray(w * h * 4), mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, [r, g, b] = fill(x, y);
    rgba.set([r, g, b, 255], i * 4);
    mask[i] = x >= w / 4 && x < 3 * w / 4 && y >= h / 4 && y < 3 * h / 4 ? 1 : 0;
  }
  return { rgba, mask };
}
const noise = (x, y) => ((x * 73856093) ^ (y * 19349663)) % 7;
const field = (x, y) => [120 + noise(x, y), 125 + noise(x, y), 110];
// Houses: a grid of bright roofs with dark edges inside the centre square.
const houses = (x, y) => {
  const inside = x >= 10 && x < 30 && y >= 10 && y < 30;
  if (inside && x % 5 < 3 && y % 5 < 3) return [220, 215, 210];
  if (inside && (x % 5 === 3 || y % 5 === 3)) return [40, 40, 45];
  return field(x, y);
};

test('structure rises when buildings appear, and change is measured against the surroundings', () => {
  const a = img(40, 40, field), b = img(40, 40, houses);
  const before = A.analyse(a.rgba, a.mask, 40, 40), after = A.analyse(b.rgba, b.mask, 40, 40);
  assert.ok(after.structure > 2 * before.structure, `${before.structure} -> ${after.structure}`);
  const ch = A.change(before, after, a.mask);
  assert.ok(ch.ratio > 2, `ratio ${ch.ratio}`);
  // Same photo with a global exposure / colour shift: no change.
  const c = img(40, 40, (x, y) => field(x, y).map(v => v * 0.7 + 30));
  const shifted = A.analyse(c.rgba, c.mask, 40, 40);
  const none = A.change(before, shifted, a.mask);
  assert.ok(none.site < 0.2, `site ${none.site}`);
});

test('imagery years: latest, and the newest before the application', () => {
  const y = A.pickYears(CFG.imagery.Mississauga, 2019);
  assert.deepEqual(y, { latest: 2024, before: 2018, preStart: true });
  const old = A.pickYears(CFG.imagery.Caledon, 2010);
  assert.equal(old.before, 2014); assert.equal(old.preStart, false);
});

test('site geometry: application boundary, else a circle sized for the building', () => {
  const ring = [[-79.70, 43.70], [-79.699, 43.70], [-79.699, 43.701], [-79.70, 43.701], [-79.70, 43.70]];
  const g = A.siteGeometry({ siteRings: [ring], lat: 43.7005, lng: -79.6995, records: [] });
  assert.equal(g.source, 'application boundary');
  assert.ok(g.area > 8000 && g.area < 9000, `~80 m x 111 m, got ${g.area}`);
  const h = A.siteGeometry({ lat: 43.7, lng: -79.7, units: 1, records: [] });
  assert.match(h.source, /^15 m/);
  assert.ok(Math.abs(h.area - Math.PI * 225) < 15);
});

const photo = (structure, coverage = 1) => ({ structure, structureAround: 1, coverage });
test('score: built-up site with new footprints is likely complete; unchanged field is not started', () => {
  const done = A.score({ phase: 'construction', buildout: null }, {
    latestYear: 2024, beforeYear: 2018, now: photo(1.6), before: photo(0.6), change: { site: 1.1, around: 0.4, ratio: 2.7 },
    fpNow: 0.4, fpBefore: 0.0, fpYearNow: 2024, fpYearBefore: 2020, permitYear: 2021, siteArea: 8000 }, new Date('2026-10-01'));
  assert.ok(done.probability >= 0.9, done.probability);
  assert.equal(done.status, 'Likely completed');

  const field = A.score({ phase: 'review', buildout: null }, {
    latestYear: 2024, beforeYear: 2021, now: photo(0.5), before: photo(0.5), change: { site: 0.3, around: 0.3, ratio: 1.0 },
    fpNow: 0, fpBefore: 0, fpYearNow: 2024, fpYearBefore: 2020, siteArea: 8000 });
  assert.ok(field.probability < 0.05, field.probability);
  assert.equal(field.status, 'Not visibly started');

  const graded = A.score({ phase: 'permit', buildout: null }, {
    latestYear: 2025, beforeYear: 2020, now: photo(0.4), before: photo(1.0), change: { site: 0.9, around: 0.3, ratio: 3 }, permitYear: 2024 }, new Date('2026-10-01'));
  assert.ok(graded.probability < 0.2, graded.probability);
  assert.equal(graded.status, 'Likely under construction');
});

test('score: an aerial older than the permit carries little weight', () => {
  const ev = { latestYear: 2024, beforeYear: 2020, now: photo(0.5), before: photo(0.5), change: { site: 0.3, around: 0.3, ratio: 1 }, permitYear: 2025 };
  const s = A.score({ phase: 'completed', buildout: null }, ev);
  assert.ok(s.probability > 0.7, s.probability);
  assert.ok(s.signals.some(x => /older than the building permit/.test(x.text)));
});

test('score: undated footprints never count against a site; a completed infill site is not penalised for no change', () => {
  const s = A.score({ phase: 'completed', buildout: null }, {
    latestYear: 2025, beforeYear: 2015, now: photo(2.3), before: photo(2.6), change: { site: 0.8, around: 0.9, ratio: 0.9 },
    fpNow: 0, fpYearNow: 'current', siteArea: 600 });
  assert.ok(s.probability >= 0.85, s.probability);
  assert.ok(!s.signals.some(x => x.effect < 0));
});

test('score: a completed record the aerial does not confirm says so', () => {
  const s = A.score({ phase: 'completed', buildout: null }, {
    latestYear: 2024, beforeYear: 2022, now: photo(2.2), before: photo(2.2), change: { site: 0.6, around: 0.6, ratio: 1.0 },
    fpNow: 0.01, fpBefore: 0.01, fpYearNow: 2024, fpYearBefore: 2022, siteArea: 900 });
  assert.ok(s.probability < 0.7, s.probability);
  assert.equal(s.status, 'Completed in the records; not confirmed on the aerial');
});
