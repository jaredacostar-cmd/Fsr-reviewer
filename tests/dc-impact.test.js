'use strict';
/* Which developments each DC project affects: the pure parts of js/dc-impact.js (the allocation of
 * docs/dc-impact/ALLOCATION.md). model() itself reads the app's state and is checked in the browser.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { projectKey, groupProjects, markUpstream, gateOf, gapOf, flowShares } = require('../js/dc-impact.js');

// A sewer network as "drains into" pointers: index → next (-1 at the plant).
const net = into => [into.length, i => into[i]];
const ups = (into, members) => { const [n, next] = net(into); return [...markUpstream(n, next, members)].flatMap((v, i) => (v ? [i] : [])); };

test('markUpstream: every pipe whose chain reaches a member, the members included', () => {
  // 0 → 1 → 2 → plant;  3 → 1;  4 → 3;  5 → plant
  const into = [1, 2, -1, 1, 3, -1];
  assert.deepEqual(ups(into, [1]), [0, 1, 3, 4]);
  assert.deepEqual(ups(into, [2]), [0, 1, 2, 3, 4]);
  assert.deepEqual(ups(into, [3]), [3, 4]);
  assert.deepEqual(ups(into, [5]), [5]);
  assert.deepEqual(ups(into, []), []);
});

test('markUpstream: several members, a member mid-run, and a branch that never joins', () => {
  // 0 → 1 → 2 → 3 → plant;  4 → 2;  6 → 5 → plant
  const into = [1, 2, 3, -1, 2, -1, 5];
  assert.deepEqual(ups(into, [1, 4]), [0, 1, 4]);
  assert.deepEqual(ups(into, [2]), [0, 1, 2, 4]);
  assert.deepEqual(ups(into, [3, 5]), [0, 1, 2, 3, 4, 5, 6]);
});

test('markUpstream: a loop in the data cannot hang the walk', () => {
  // 0 → 1 → 2 → 0 (a loop);  3 → 4 → plant
  const into = [1, 2, 0, 4, -1];
  assert.deepEqual(ups(into, [4]), [3, 4]);                // the loop never reaches 4: not upstream
  assert.deepEqual(ups(into, [1]), [0, 1, 2]);             // around the loop, 0 and 2 do reach 1
  // a pointer out of range ends the chain
  assert.deepEqual(ups([7, -1], [1]), [1]);
});

test('gateOf: the latest construction year among the gating tiers (A and B1 by default)', () => {
  const links = [{ key: 'a', tier: 'A', y: 2027 }, { key: 'b', tier: 'B1', y: 2030 }, { key: 'c', tier: 'B1', y: null }, { key: 'd', tier: 'B2', y: 2034 }];
  assert.deepEqual(gateOf(links), { y: 2030, key: 'b' });                 // B2 (on the path only) never gates
  assert.deepEqual(gateOf(links, ['A']), { y: 2027, key: 'a' });
  assert.deepEqual(gateOf(links, ['A', 'B1', 'B2']), { y: 2034, key: 'd' });
  assert.equal(gateOf([{ key: 'c', tier: 'B1', y: null }]), null);
  assert.equal(gateOf([]), null);
});

test('gapOf: first homes before the gate year', () => {
  assert.equal(gapOf(2026, { y: 2028 }), true);
  assert.equal(gapOf(2028, { y: 2028 }), false);
  assert.equal(gapOf(null, { y: 2028 }), false);
  assert.equal(gapOf(2026, null), false);
});

test('flowShares: a project cost apportioned by flow, adding back up to the cost', () => {
  const s = flowShares([{ q: 10 }, { q: 30 }, { q: 0 }], 1000);
  assert.deepEqual(s, [250, 750, 0]);
  assert.equal(s.reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(flowShares([{ q: 0 }, { q: 0 }], 100), [50, 50]);   // no flow: equal shares
  assert.deepEqual(flowShares([{ q: 5 }], 0), [0]);                    // not costed
  assert.deepEqual(flowShares([], 100), []);
});

test('groupProjects: lines grouped by project, with years, size, kind and length', () => {
  const flat = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dc = {
    wastewater: { lines: [
      { p: '22-2255', c: '58439', k: 'primary', d: 1800, y: 2026, s: 'approved', g: [[0, 0], [300, 400]] },
      { p: '22-2255', c: '58440', k: 'local', d: 600, y: 2028, s: 'proposed', g: [[0, 0], [0, 100]] },
      { c: '50001', k: 'local', d: 0, y: null, s: 'proposed', g: [[0, 0], [10, 0]] },
      { k: 'local', g: [[0, 0], [1, 0]] },                                 // no project number: left out
    ] },
    water: { lines: [{ p: '31-1199', k: 'feeder', d: 900, y: 2031, s: 'proposed', g: [[0, 0], [0, 50]] }] },
  };
  const g = groupProjects(dc, flat);
  assert.deepEqual(g.map(x => `${x.sys}:${x.key}`), ['wastewater:22-2255', 'wastewater:50001', 'water:31-1199']);
  const t = g[0];
  assert.equal(t.k, 'primary'); assert.equal(t.d, 1800); assert.equal(t.y0, 2026); assert.equal(t.y1, 2028);
  assert.equal(t.lenM, 600); assert.equal(t.status, 'approved'); assert.equal(t.lines.length, 2);
  assert.equal(g[1].y0, null); assert.equal(g[1].y1, null);
  assert.equal(projectKey({ c: '9' }), '9'); assert.equal(projectKey({}), null);
});

test('loaded after js/masterplan.js, in the offline shell; costEstimate is exported for it', () => {
  const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const html = src('index.html');
  assert.ok(html.indexOf('js/dc-impact.js') > html.indexOf('js/masterplan.js'));
  assert.match(src('sw.js'), /'js\/dc-impact\.js',/);
  assert.match(src('js/dc-cost.js'), /\n {4}costEstimate,\n/);
});
