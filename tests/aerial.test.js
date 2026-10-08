'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/aerial.js');
const CFG = require('../js/config.js');

test('pixel classes: grass, soil, roof/pavement, shadow', () => {
  assert.equal(A.classify(70, 110, 60), 'veg');
  assert.equal(A.classify(160, 130, 95), 'soil');
  assert.equal(A.classify(150, 150, 155), 'built');
  assert.equal(A.classify(235, 235, 230), 'built');
  assert.equal(A.classify(20, 22, 25), 'shadow');
});

test('analyse counts only pixels inside the site and covered by imagery', () => {
  const px = (r, g, b, a = 255) => [r, g, b, a];
  const rgba = Uint8ClampedArray.from([...px(70, 110, 60), ...px(150, 150, 150), ...px(160, 130, 95), ...px(0, 0, 0, 0), ...px(70, 110, 60)]);
  const mask = Uint8Array.from([1, 1, 1, 1, 0]);
  const s = A.analyse(rgba, mask);
  assert.equal(s.pixels, 3);
  assert.ok(Math.abs(s.veg - 1 / 3) < 1e-9 && Math.abs(s.built - 1 / 3) < 1e-9 && Math.abs(s.soil - 1 / 3) < 1e-9);
  assert.equal(s.coverage, 0.75);
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

const land = (built, veg, soil) => ({ built, veg, soil, coverage: 1 });
test('score: built-up site with new footprints is likely complete; unchanged field is not started', () => {
  const done = A.score({ phase: 'construction', buildout: null }, {
    latestYear: 2024, beforeYear: 2018, now: land(0.7, 0.1, 0.02), before: land(0.1, 0.8, 0.05), change: 0.6,
    fpNow: 0.4, fpBefore: 0.0, fpYearNow: 2024, fpYearBefore: 2020, permitYear: 2021 }, new Date('2026-10-01'));
  assert.ok(done.probability >= 0.9, done.probability);
  assert.equal(done.status, 'Likely completed');

  const field = A.score({ phase: 'review', buildout: null }, {
    latestYear: 2024, beforeYear: 2021, now: land(0.05, 0.85, 0.05), before: land(0.05, 0.86, 0.04), change: 0.1,
    fpNow: 0, fpBefore: 0, fpYearNow: 2024, fpYearBefore: 2020 });
  assert.ok(field.probability < 0.05, field.probability);
  assert.equal(field.status, 'Not visibly started');

  const digging = A.score({ phase: 'permit', buildout: null }, {
    latestYear: 2025, beforeYear: 2020, now: land(0.2, 0.1, 0.5), before: land(0.1, 0.8, 0.05), change: 0.7, permitYear: 2024 }, new Date('2026-10-01'));
  assert.ok(digging.probability < 0.2, digging.probability);
  assert.equal(digging.status, 'Likely under construction');
});

test('score: an aerial older than the permit carries little weight', () => {
  const ev = { latestYear: 2024, beforeYear: 2020, now: land(0.05, 0.85, 0.05), before: land(0.05, 0.85, 0.05), change: 0.05, permitYear: 2025 };
  const s = A.score({ phase: 'completed', buildout: null }, ev);
  assert.ok(s.probability > 0.7, s.probability);
  assert.ok(s.signals.some(x => /older than the building permit/.test(x.text)));
});
