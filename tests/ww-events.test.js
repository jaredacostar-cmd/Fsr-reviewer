const test = require('node:test');
const assert = require('node:assert');
const D = require('../data/ww-events.json');

test('collection system events: totals, references, the April 2025 storm', () => {
  assert.equal(D.years['2025'].length, D.reports['2025'].total);
  assert.equal(D.years['2024'].length, D.reports['2024'].total);
  for (const [y, ev] of Object.entries(D.years)) for (const e of ev) {
    assert.match(e.sacRef, /^1-[A-Z0-9]{6}$/, `${y} ${e.place}`);
    assert.ok(e.date.startsWith(y), `${e.place} date in ${y}`);
    assert.ok(['overflow', 'spill'].includes(e.kind));
    assert.ok(e.volumeM3 == null || e.volumeM3 >= 0);
  }
  const weir = D.years['2025'].find(e => e.sacRef === '1-N9IN7T');
  assert.equal(weir.date, '2025-04-02'); assert.equal(weir.volumeM3, 944);
  assert.equal(D.years['2024'].filter(e => e.date === '2024-07-16').length, 13, 'July 16, 2024: 13 events');
  assert.equal(D.years['2024'].filter(e => e.delayedReport && e.date === '2024-07-16').length, 9, 'nine delayed reports');
  assert.equal(D.stations.southPeel.length, 32);
});

test('station names match between the report and the GIS layer', () => {
  global.PeelApp = { state: { wwEvents: D } };
  require('../js/ww-events.js');
  const W = globalThis.PeelWwEvents, gis = require('../data/servicing.json').pumpingStations.map(p => W.key(p.name));
  for (const n of [...D.stations.southPeel, ...D.stations.inglewood]) assert.ok(gis.includes(W.key(n)), n);
  assert.equal(W.key('Clarkson · Richards Memorial PS'), W.key('RICHARD MEMORIAL SEW. PUMP STN'));
  delete global.PeelApp;
});
