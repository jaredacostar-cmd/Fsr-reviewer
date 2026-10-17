const test = require('node:test');
const assert = require('node:assert');
const areas = require('../data/areas.json');
const { ringsHa } = require('../scripts/build-areas.js');

test('secondary plans carry their mapped area; Brampton plans their published size', () => {
  for (const p of areas.secondaryPlans) assert.ok(p.mappedHa > 0, `${p.name} mapped area`);
  const b = areas.secondaryPlans.filter(p => p.municipality === 'Brampton');
  assert.ok(b.filter(p => p.areaHa > 0).length >= 30, 'published sizes');
  const sh = b.find(p => /Snelgrove/.test(p.name));
  assert.ok(Math.abs(sh.areaHa - sh.mappedHa) / sh.mappedHa < 0.05, 'Snelgrove-Heart Lake: published and mapped agree');
  assert.ok(b.some(p => p.appeals), 'an appeal is carried');
});

test('ringsHa: a 0.01° square near Brampton is about 80 ha', () => {
  const r = [[[-79.76, 43.7], [-79.75, 43.7], [-79.75, 43.71], [-79.76, 43.71], [-79.76, 43.7]]];
  const ha = ringsHa(r);
  assert.ok(ha > 78 && ha < 83, String(ha));
});
