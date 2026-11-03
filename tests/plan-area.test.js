const test = require('node:test');
const { siteTest } = require('./helpers/site-check.js');
const assert = require('node:assert');
const areas = require('../data/areas.json');
const { ringsHa } = require('../scripts/build-areas.js');

test('secondary plans carry their mapped area; Brampton plans their published size', () => {
  for (const p of areas.secondaryPlans) assert.ok(p.mappedHa > 0, `${p.name} mapped area`);
  const b = areas.secondaryPlans.filter(p => p.municipality === 'Brampton');
  assert.ok(b.filter(p => p.areaHa > 0).length >= 30, 'published sizes');
});

// (site check: one Brampton plan carries an appeal today, 40 (a): Bram West; once that appeal is settled and
// Brampton clears its APPEALS field, none may, data/areas.json)
siteTest('secondary plans: an appeal is carried (site check: Brampton\'s plans under appeal, now 40 (a): Bram West)', () => {
  const b = areas.secondaryPlans.filter(p => p.municipality === 'Brampton');
  assert.ok(b.some(p => p.appeals), 'an appeal is carried');
});

// (site check: one real plan's published size and its mapped outline, both read from Brampton's open data by the
// weekly refresh's areas step, data/areas.json)
siteTest('secondary plans: a Brampton plan\'s published size and mapped area agree (site check: Snelgrove-Heart Lake)', () => {
  const b = areas.secondaryPlans.filter(p => p.municipality === 'Brampton');
  const sh = b.find(p => /Snelgrove/.test(p.name));
  assert.ok(Math.abs(sh.areaHa - sh.mappedHa) / sh.mappedHa < 0.05, 'Snelgrove-Heart Lake: published and mapped agree');
});

test('ringsHa: a 0.01° square near Brampton is about 90 ha (805 m × 1,113 m)', () => {
  const r = [[[-79.76, 43.7], [-79.75, 43.7], [-79.75, 43.71], [-79.76, 43.71], [-79.76, 43.7]]];
  const ha = ringsHa(r);
  assert.ok(ha > 88 && ha < 91, String(ha));
});
