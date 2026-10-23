'use strict';
/* Which planned DC main relieves an existing sewer: js/dc-relief.js (used by pipeReliefOf in
 * js/masterplan.js). The cases are the ones found on the October 2026 data
 * (docs/dc-impact/ALLOCATION.md, step 3). Coordinates here are flat metres, east and north.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sizeOk, offsetOk, reliefMatch, pickRelief } = require('../js/dc-relief.js');

// Distance (m) from a point to a polyline, in flat metres.
function dist(pt, g) {
  let best = Infinity;
  for (let i = 1; i < g.length; i++) {
    const [ax, ay] = g[i - 1], [bx, by] = g[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx - pt[0], ay + t * dy - pt[1]));
  }
  return best;
}
// An east–west sewer 400 m long (points every 50 m), and a DC line beside it `off` metres north.
const sewer = Array.from({ length: 9 }, (_, i) => [i * 50, 0]);
const line = (off, o = {}) => ({ k: 'local', d: 0, g: [[-20, off], [420, off]], ...o });
const match = (ln, mm) => reliefMatch(ln, mm, sewer.map(pt => dist(pt, ln.g)));

test('a trunk twin in a parallel corridor relieves the trunk (25-2219, 22-2255)', () => {
  assert.ok(match(line(110, { k: 'primary', d: 1800 }), 2100));
  assert.ok(match(line(140, { k: 'primary', d: 2400 }), 3000));
});

test('a small local main on a nearby street does not relieve a 2 m trunk (26-2117, 26-2128)', () => {
  assert.equal(match(line(120, { d: 450 }), 2100), null);        // too small, and not on the street
  assert.equal(match(line(140, { d: 0 }), 1950), null);          // no diameter, trunk-sized sewer
  assert.equal(match(line(10, { d: 450 }), 2100), null);         // on the street, still too small
});

test('a local main on the same street relieves a sewer of its size or smaller', () => {
  assert.ok(match(line(10, { d: 1200 }), 1200));                 // 25-2120
  assert.ok(match(line(3, { d: 0 }), 300));                      // 28-2137: no diameter, on a 300 mm sewer
  assert.ok(match(line(25, { d: 0 }), 600));                     // 15-2153: no diameter, small sewers
});

test('a local main on a parallel street does not relieve it, whatever its size (25-2158)', () => {
  assert.equal(match(line(100, { d: 750 }), 300), null);
  assert.equal(match(line(31, { d: 600 }), 300), null);
});

test('a main described as a twin or relief passes the size test', () => {
  assert.ok(match(line(20, { d: 0, n: 'Lower West Sanitary Trunk Sewer Twinning' }), 2100));
  assert.ok(sizeOk({ k: 'local', d: 300, t: 'relief sewer' }, 1500));
});

test('size and offset rules on their own', () => {
  assert.equal(sizeOk({ k: 'primary', d: 0 }, 2400), true);      // trunk with no diameter on the map
  assert.equal(sizeOk({ k: 'force', d: 0 }, 900), true);
  assert.equal(sizeOk({ k: 'local', d: 0 }, 675), false);
  assert.equal(sizeOk({ k: 'local', d: 525 }, 1050), true);      // exactly half
  assert.equal(offsetOk({ k: 'local' }, 30), true);
  assert.equal(offsetOk({ k: 'local' }, 31), false);
  assert.equal(offsetOk({ k: 'primary' }, 150), true);
  assert.equal(offsetOk({ k: 'primary' }, 151), false);
});

test('a line along less than half the sewer is not relief, however well sized', () => {
  const short = { k: 'primary', d: 2400, g: [[-20, 20], [50, 20]] };   // within 150 m of 4 of the 9 points
  assert.equal(match(short, 1200), null);
  assert.equal(reliefMatch(short, 1200, []), null);
});

test('pickRelief: the line along most of the sewer, then the largest; rejected lines never win', () => {
  const a = line(10, { k: 'primary', d: 1200 }), b = line(20, { k: 'primary', d: 1500 }), c = line(5, { d: 300 });
  assert.equal(pickRelief(1200, sewer, [a, b, c], dist), b);    // both along all of it: the larger
  const half = { k: 'primary', d: 2400, g: [[180, 10], [420, 10]] };
  assert.equal(pickRelief(1200, sewer, [half, a], dist), a);     // a runs along more of it
  assert.equal(pickRelief(2100, sewer, [c, line(120, { d: 450 })], dist), null);
});

test('loaded before js/masterplan.js, and in the offline shell', () => {
  const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const html = src('index.html');
  assert.ok(html.indexOf('js/dc-relief.js') > 0 && html.indexOf('js/dc-relief.js') < html.indexOf('js/masterplan.js'));
  assert.match(src('sw.js'), /'js\/dc-relief\.js',/);
  assert.match(src('js/masterplan.js'), /PeelDcRelief\.pickRelief\(/);
});
