'use strict';
// DC joins (js/dc-joins.js): reviewed joins matched to a planned main's end by position, edits over
// the committed list, and how sure an automatic join is.
const test = require('node:test');
const assert = require('node:assert');
const DJ = require('../js/dc-joins.js');

const end = [-79.7225, 43.6575];
const near = [end[0] + 0.00002, end[1] + 0.00002];      // ~2.7 m off
const far = [end[0] + 0.0002, end[1]];                    // ~16 m off

test('an edit replaces the committed join at the same end; an auto edit drops it', () => {
  const shipped = [{ sys: 'wastewater', end, to: [-79.72, 43.66], into: 'sewer' }, { sys: 'water', end, to: null, into: null }];
  let m = DJ.merge(shipped, [{ sys: 'wastewater', end: near, to: null, into: null }]);
  assert.strictEqual(m.length, 2);
  assert.strictEqual(m.find(j => j.sys === 'wastewater').to, null, 'the edit wins');
  m = DJ.merge(shipped, [{ sys: 'wastewater', end: near, auto: true }]);
  assert.deepStrictEqual(m.map(j => j.sys), ['water'], 'auto: back to the automatic join');
  m = DJ.merge(shipped, [{ sys: 'wastewater', end: far, to: null, into: null }]);
  assert.strictEqual(m.length, 3, 'an end 16 m away is another end');
});

test('a reviewed join is found within 5 m of the end, for its own system only', () => {
  DJ.setEdit('water', end, { to: [-79.72, 43.66], into: 'watermain' });
  assert.ok(DJ.override('water', near));
  assert.strictEqual(DJ.override('water', far), null);
  assert.strictEqual(DJ.override('wastewater', end), null);
  const v = DJ.version();
  DJ.setEdit('water', near, { auto: true });
  assert.strictEqual(DJ.override('water', end), null);
  assert.ok(DJ.version() > v, 'an edit bumps the version the traces rebuild on');
  assert.deepStrictEqual(DJ.exportJSON().joins, []);
});

test('automatic joins: drawn within 60 m, bridged to 200 m, far beyond, open with nothing', () => {
  const j = (m, into = { kind: 'sewer', d: 600 }) => ({ auto: true, m, into });
  assert.strictEqual(DJ.conf(j(30)), 'drawn');
  assert.strictEqual(DJ.conf(j(150)), 'bridged');
  assert.strictEqual(DJ.conf(j(450)), 'far');
  assert.strictEqual(DJ.conf({ auto: true, m: null, into: null }), 'open');
  assert.strictEqual(DJ.conf({ auto: false, m: 0, into: null }), 'reviewed');
});

test('water: an end at a facility joins through it; nothing joined is flagged, by zone or not', () => {
  assert.strictEqual(DJ.conf({ sys: 'water', auto: true, fac: 'Mayfield Reservoir', into: null, m: null }), 'facility');
  assert.strictEqual(DJ.conf({ sys: 'water', auto: true, into: null, m: null, zoneBlocked: { m: 80, zone: 'pz:6' } }), 'zone');
  assert.strictEqual(DJ.conf({ sys: 'water', auto: true, into: null, m: null }), 'unjoined');
  assert.strictEqual(DJ.conf({ sys: 'wastewater', auto: true, into: null, m: null }), 'open', 'a sewer end with nothing is just open');
  assert.strictEqual(DJ.conf({ sys: 'water', auto: true, into: { kind: 'watermain', d: 400 }, m: 30 }), 'drawn');
});

test('an end the DC map cuts off is said so, not called open', () => {
  const ln = { g: [[-79.9, 43.8], [-79.8, 43.8]], x: [1] };
  assert.strictEqual(DJ.conf({ sys: 'water', auto: true, ln, pt: [-79.8, 43.8], into: null, m: null }), 'edge');
  assert.strictEqual(DJ.conf({ sys: 'water', auto: true, ln, pt: [-79.9, 43.8], into: null, m: null }), 'unjoined');
  assert.strictEqual(DJ.conf({ sys: 'wastewater', auto: true, ln, pt: [-79.8, 43.8], into: null, m: null }), 'edge');
});

test('capital projects: new mains tendered or further join the network; relining and DC duplicates do not', () => {
  const g = { type: 'LineString', coordinates: [[-79.7, 43.7], [-79.69, 43.7]] };
  const recs = [
    { system: 'water', workType: 'WM', status: 'under construction', projectNumber: '24-2274', street: 'THE GORE RD', geometry: g },
    { system: 'water', workType: 'WM', status: 'planned', projectNumber: '25-1151', geometry: g },
    { system: 'wastewater', workType: 'SAN-RELINING', status: 'complete', projectNumber: '19-2300', geometry: g },
    { system: 'wastewater', workType: 'SAN-DEVELOPMENT', status: 'complete', projectNumber: '19-2158', geometry: { type: 'MultiLineString', coordinates: [g.coordinates, g.coordinates] } },
    { system: 'wastewater', workType: 'SAN', status: 'complete', projectNumber: '25-2146', geometry: g },
  ];
  const out = DJ.capFrom(recs, { water: { lines: [] }, wastewater: { lines: [{ p: '25-2146' }] } });
  assert.deepStrictEqual(out.water.map(l => l.p), ['24-2274']);
  assert.deepStrictEqual(out.wastewater.map(l => l.p), ['19-2158', '19-2158'], 'each part of a multi-line; the DC main itself left out');
  assert.ok(out.water[0].cap && out.water[0].g.length === 2);
});

test('a sewer head (its other end joins) is its own state, not a gap to review', () => {
  assert.strictEqual(DJ.conf({ sys: 'wastewater', auto: true, head: true, into: null, m: null, ln: { g: [[0, 0], [1, 1]] }, pt: [0, 0] }), 'head');
});
