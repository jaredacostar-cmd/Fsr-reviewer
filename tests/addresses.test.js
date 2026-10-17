const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const A = require('../js/address-key.js');
const { classifyPairs } = require('../js/audit.js');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));

test('address keys: multi-address strings, number 0, municipality tails, highways', () => {
  assert.deepStrictEqual(A.keys('1580 and 1650 Dundas St E.', 'Mississauga'), ['Mississauga|1580|DUNDAS|ST|E', 'Mississauga|1650|DUNDAS|ST|E']);
  assert.deepStrictEqual(A.keys('50 & 60 Harborn Rd', 'Mississauga'), ['Mississauga|50|HARBORN|RD|', 'Mississauga|60|HARBORN|RD|']);
  assert.deepStrictEqual(A.keys('120, 128 Queen St S and 169 Crumbie St', 'Brampton'), ['Brampton|120|QUEEN|ST|S', 'Brampton|128|QUEEN|ST|S', 'Brampton|169|CRUMBIE|ST|']);
  assert.deepStrictEqual(A.keys('0 HERITAGE RD', 'Brampton'), []);
  assert.deepStrictEqual(A.keys('North East Corner of Embleton and Heritage Road', 'Brampton'), []);
  assert.deepStrictEqual(A.keys('10625 Mississauga Road, Brampton, ON L6X 0A1', 'Brampton'), ['Brampton|10625|MISSISSAUGA|RD|']);
  assert.deepStrictEqual(A.keys('14337 HIGHWAY 50 CALEDON ON L7E 3H6', 'Caledon'), ['Caledon|14337|50|HWY|']);
  assert.deepStrictEqual(A.keys('2 Erskine Road formerly known as 151 City Centre Dr', 'Mississauga'), ['Mississauga|2|ERSKINE|RD|']);
  assert.equal(A.civic('14337', '50', 'HWY', '', 'Caledon'), 'Caledon|14337|50|HWY|');
});

test('address points: the three 10625 Mississauga Rd files share one point; match rates hold', () => {
  const D = read('address-points.json');
  global.PeelApp = { state: { addressPoints: D } };   // the module's root is globalThis under node
  const recs = read('snapshot.json').records;
  const ids = new Set(recs.filter(r => ['OZS-2021-0002', 'SP16-088.000', 'C04W14.009'].includes(r.ref)).flatMap(r => A.of(r).map(p => p.id)));
  assert.equal(ids.size, 1, '10625 Mississauga Rd → one address point');
  assert.ok(parseFloat(D.stats.applications.rate) >= 75, `applications matched ${D.stats.applications.rate}`);
  assert.ok(parseFloat(D.stats.permits.rate) >= 80, `permits matched ${D.stats.permits.rate}`);
  for (const v of Object.values(D.a).slice(0, 500)) assert.ok(v[1] > 43.4 && v[1] < 44.1 && v[2] > -80.2 && v[2] < -79.4, 'in Peel');
  delete global.PeelApp;
});

test('duplicate pairs sort same address point first, neighbours last', () => {
  const p = (t, ids) => ({ title: t, ids: new Set(ids) });
  const possible = [
    { projects: [p('a', [1]), p('b', [2])], metres: 20, sameUnits: true, units: 100 },
    { projects: [p('c', [3]), p('d', [3, 4])], metres: 50, sameUnits: false, units: 40 },
    { projects: [p('e', []), p('f', [5])], metres: 30, sameUnits: false, units: 60 },
  ];
  const c = classifyPairs(possible, x => x.ids);
  assert.deepStrictEqual(c.pairs.map(x => x.addr), ['same', 'unknown', 'different']);
  assert.deepStrictEqual([c.same, c.different, c.unknown], [1, 1, 1]);
});
