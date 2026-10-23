'use strict';
/* Where each development discharges, reviewed and set by hand (QA/QC › Review outlets): the pure parts of
 * js/dev-outlets.js. The page, the map pick and the models following a set outlet are checked in the
 * browser (tests/browser/run.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { merge, exportJSON, diff, nearestOn, distinct, isCurrent } = require('../js/dev-outlets.js');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('merge: this browser\'s edits over the committed outlets, by development and system', () => {
  const shipped = [{ key: 'A', sys: 'wastewater', mode: 'confirmed' }, { key: 'B', mode: 'set', kind: 'sewer', at: [1, 2], mm: 300 }, { key: 'A', sys: 'water', mode: 'confirmed' }];
  const edits = [{ key: 'A', sys: 'wastewater', mode: 'set', kind: 'dc', at: [3, 4], project: '25-2267' }, { key: 'B', sys: 'wastewater', auto: true }, { key: 'C', mode: 'confirmed' }];
  const m = merge(shipped, edits);
  assert.equal(m.get('wastewater|A').mode, 'set', 'an edit replaces the committed record');
  assert.equal(m.get('wastewater|A').project, '25-2267');
  assert.equal(m.has('wastewater|B'), false, 'Automatic drops a committed record (no sys means wastewater)');
  assert.equal(m.get('water|A').mode, 'confirmed', 'water records are kept apart');
  assert.equal(m.get('wastewater|C').mode, 'confirmed');
  assert.equal(m.size, 3);
});

test('exportJSON: the committed file, without this browser\'s marks', () => {
  const m = merge([], [{ key: 'A', mode: 'set', kind: 'sewer', at: [-79.7, 43.7], mm: 375, src: 'FSR p. 12', date: '2026-10-23', local: true }, { key: 'B', mode: 'confirmed', date: '2026-10-23', local: true }]);
  const j = exportJSON(m);
  assert.equal(j.version, 1);
  assert.deepEqual(j.outlets, [
    { key: 'A', sys: 'wastewater', mode: 'set', kind: 'sewer', at: [-79.7, 43.7], mm: 375, src: 'FSR p. 12', date: '2026-10-23' },
    { key: 'B', sys: 'wastewater', mode: 'confirmed', date: '2026-10-23' },
  ]);
  // The shipped file has the same shape, empty until outlets are reviewed and committed.
  const d = JSON.parse(src('data/dev-outlets.json'));
  assert.equal(d.version, 1); assert.ok(Array.isArray(d.outlets));
});

test('diff: what a new outlet adds and drops, and its gate year (gating tiers only)', () => {
  const now = [{ key: '23-2261', tier: 'B1', y: 2027 }, { key: '22-2255', tier: 'B1', y: 2028 }];
  const then = [{ key: '25-2264', tier: 'B1', y: 2027 }, { key: '22-2255', tier: 'B1', y: 2028 }, { key: '15-2153', tier: 'B2', y: 2031 }];
  const d = diff(now, then);
  assert.deepEqual(d.add.map(x => x.key), ['25-2264', '15-2153']);
  assert.deepEqual(d.drop.map(x => x.key), ['23-2261']);
  assert.equal(d.gate, 2028, 'B2 (on its path, has room) never sets the gate');
  assert.equal(d.gateNow, 2028);
  assert.equal(diff([], [{ key: 'X', tier: 'A', y: 2030 }]).gate, 2030);
  assert.equal(diff([], []).gate, null);
});

test('nearestOn: the point on a sewer nearest the site', () => {
  const g = [[-79.70, 43.70], [-79.69, 43.70]];
  const q = nearestOn([-79.695, 43.701], g);
  assert.ok(Math.abs(q[0] + 79.695) < 1e-9 && Math.abs(q[1] - 43.70) < 1e-9);
  assert.deepEqual(nearestOn([-79.71, 43.70], g), [-79.70, 43.70], 'past an end: the end');
});

test('distinct: the nearby list shows each sewer run and each DC project once, nearest first', () => {
  const items = [{ id: 1, run: 'a', m: 5 }, { id: 2, run: 'a', m: 20 }, { id: 3, run: 'b', m: 40 }, { id: 4, run: 'c', m: 60 }, { id: 5, run: 'b', m: 80 }];
  const same = (x, y) => x.run === y.run;
  assert.deepEqual(distinct(items, same).map(x => x.id), [1, 3, 4]);
  assert.deepEqual(distinct(items, same, 2).map(x => x.id), [1, 3], 'up to max');
});

test('isCurrent: the candidate that is the outlet in use now', () => {
  assert.equal(isCurrent({ kind: 'sewer', k: 7 }, { k: 7, path: null }), true);
  assert.equal(isCurrent({ kind: 'sewer', k: 7 }, { k: 8, path: null }), false);
  assert.equal(isCurrent({ kind: 'sewer', k: 7 }, { k: 7, path: { first: { p: '25-2267' } } }), false, 'routed along a planned main: not the sewer');
  assert.equal(isCurrent({ kind: 'dc', project: '25-2267' }, { k: 7, path: { first: { p: '25-2267' } } }), true);
  assert.equal(isCurrent({ kind: 'dc', project: '25-2267' }, null), false);
});

test('wired in: the page, the models and the offline shell', () => {
  assert.match(src('js/sewer-cap.js'), /window\.PeelDevOutlets\.pipeFor\(p\)/);
  assert.match(src('js/sewer-cap.js'), /window\.PeelDevOutlets \? window\.PeelDevOutlets\.version\(\) : 0/, 'the load model re-runs when an outlet changes');
  assert.match(src('js/dc-impact.js'), /DO\.dcRouteFor\(d\.p\)/);
  assert.match(src('js/sewer-trace.js'), /DO\.dcRouteFor\(p\)/);
  const html = src('index.html');
  assert.ok(html.indexOf('js/dev-outlets.js') > html.indexOf('js/dc-impact.js'));
  assert.match(src('sw.js'), /'js\/dev-outlets\.js',/);
  assert.match(src('js/workspaces.js'), /\['QA\/QC', \['outlets'\]\]/);
  assert.ok(JSON.parse(src('data/sources.json')).files['dev-outlets.json'] || /"dev-outlets\.json"/.test(src('data/sources.json')));
});
