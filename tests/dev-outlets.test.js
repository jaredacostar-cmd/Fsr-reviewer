'use strict';
/* Where each development discharges, reviewed and set by hand (QA/QC › Review outlets): the pure parts of
 * js/dev-outlets.js. The page, the map pick and the models following a set outlet are checked in the
 * browser (tests/browser/run.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { merge, exportJSON, diff, nearestOn, distinct, isCurrent, sameOutlet, evidence, worst, stageGroup, fsrCheck, normStreet } = require('../js/dev-outlets.js');

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
  // a sewer being built (a capital project): current where its route starts on that project's sewer
  assert.equal(isCurrent({ kind: 'cap', project: '16-2291' }, { k: 7, path: { first: { cap: true, p: '16-2291' } } }), true);
  assert.equal(isCurrent({ kind: 'dc', project: '16-2291' }, { k: 7, path: { first: { cap: true, p: '16-2291' } } }), false, 'a DC main is not the capital sewer');
});

test('sameOutlet: one pipe (existing) or one project (planned or being built)', () => {
  assert.equal(sameOutlet({ kind: 'sewer', k: 3, at: [0, 0] }, { kind: 'sewer', k: 3, at: [1, 1] }), true);
  assert.equal(sameOutlet({ kind: 'cap', project: '16-2291' }, { kind: 'cap', project: '16-2291' }), true);
  assert.equal(sameOutlet({ kind: 'cap', project: '16-2291' }, { kind: 'dc', project: '16-2291' }), false);
  assert.equal(sameOutlet(null, { kind: 'sewer', k: 3 }), false);
});

test('stageGroup: built, committed (a building or site servicing permit), early', () => {
  assert.equal(stageGroup('completed', null), 'built');
  assert.equal(stageGroup('permit', null), 'committed');
  assert.equal(stageGroup('construction', null), 'committed');
  assert.equal(stageGroup('review', 2025), 'committed', 'a site servicing permit on file');
  assert.equal(stageGroup('approved', null), 'early');
  assert.equal(stageGroup('inception', null), 'early');
});

const tone = (list, k) => (list.find(x => x.k === k) || {}).tone;
test('evidence: the stage rule', () => {
  const ex = { cls: 'existing' }, planned = { cls: 'planned', ready: 2030 }, building = { cls: 'building', ready: 2027 };
  assert.equal(tone(evidence({ phase: 'completed', outlet: ex }), 'stage'), 'ok');
  assert.equal(tone(evidence({ phase: 'completed', outlet: building }), 'stage'), 'warn');
  assert.equal(tone(evidence({ phase: 'completed', outlet: planned }), 'stage'), 'bad');
  assert.equal(tone(evidence({ phase: 'permit', outlet: planned }), 'stage'), 'bad', 'permitted on a DC main not tendered');
  assert.equal(tone(evidence({ phase: 'permit', outlet: building }), 'stage'), 'ok');
  assert.equal(tone(evidence({ phase: 'review', ssp: 2025, outlet: planned }), 'stage'), 'bad', 'a site servicing permit counts as committed');
  assert.equal(tone(evidence({ phase: 'review', outlet: planned }), 'stage'), 'ok', 'early: any outlet');
  // further down the route: a sewer being built that feeds a DC main not tendered
  const fed = { cls: 'building', ready: 2030, readyBy: '25-2267', via: ['25-2267'] };
  assert.equal(tone(evidence({ phase: 'permit', outlet: fed }), 'stage'), 'bad');
  assert.match(evidence({ phase: 'permit', outlet: fed }).find(x => x.k === 'stage').text, /route needs DC main 25-2267/);
  assert.match(evidence({ phase: 'review', first: 2027, outlet: fed }).find(x => x.k === 'time').text, /≈2030 \(25-2267 on its route\), after first homes/);
});

test('evidence: in service by first homes, install year, permit date', () => {
  assert.equal(tone(evidence({ phase: 'review', first: 2027, outlet: { cls: 'planned', ready: 2030 } }), 'time'), 'bad');
  assert.equal(tone(evidence({ phase: 'review', first: 2031, outlet: { cls: 'planned', ready: 2030 } }), 'time'), 'ok');
  assert.equal(tone(evidence({ phase: 'review', first: 2027, outlet: { cls: 'existing' } }), 'time'), 'ok');
  assert.equal(tone(evidence({ phase: 'review', outlet: { cls: 'building' } }), 'time'), 'unk');
  assert.equal(tone(evidence({ phase: 'completed', built: 2015, outlet: { cls: 'existing', install: 2020 } }), 'install'), 'bad', 'installed after it was built');
  const own = evidence({ phase: 'completed', built: 2015, dist: 60, outlet: { cls: 'existing', install: 2014 } });
  assert.equal(tone(own, 'install'), 'ok'); assert.match(own.find(x => x.k === 'install').text, /likely its own sewer/);
  assert.equal(tone(evidence({ phase: 'completed', built: 2015, dist: 600, outlet: { cls: 'existing', install: 2014 } }), 'install'), undefined, 'too far to be its own');
  assert.equal(tone(evidence({ phase: 'review', ssp: 2024, outlet: { cls: 'building', start: 2027 } }), 'permit'), 'warn');
});

test('evidence: gravity (ground over the invert, less depth and fall) and drainage area', () => {
  const g = (ground, invert, dist = 100) => tone(evidence({ phase: 'review', dist, outlet: { cls: 'existing' }, gravity: { ground, invert } }), 'gravity');
  assert.equal(g(200, 195), 'ok');            // 200 - 1.5 - 0.5 - 195 = 3 m
  assert.equal(g(200, 197.5), 'warn');        // 0.5 m
  assert.equal(g(200, 199), 'bad');           // -1 m: pumping
  assert.equal(g(undefined, 195), 'unk');     // still asking
  assert.equal(g(null, 195), 'unk');
  assert.equal(g(200, null), 'unk');
  const d = (site, outlet) => tone(evidence({ phase: 'review', outlet: { cls: 'existing' }, drain: { site, outlet } }), 'drain');
  assert.equal(d(['Clarkson 1'], 'Clarkson 1'), 'ok');
  assert.equal(d(['Clarkson 1'], 'G.E. Booth 2'), 'warn');
  assert.equal(d([], 'G.E. Booth 2'), undefined);
});

test('worst: bad, then warn, then unknown, then ok', () => {
  assert.equal(worst([{ tone: 'ok' }, { tone: 'unk' }, { tone: 'warn' }]), 'warn');
  assert.equal(worst([{ tone: 'ok' }, { tone: 'bad' }]), 'bad');
  assert.equal(worst([]), 'ok');
});

test('fsrCheck: does an outlet match what the FSR says', () => {
  const f = (outlet, confidence = 'high') => ({ outlet, confidence, quotes: [{ page: 12 }] });
  const tone = (fs, c) => (fsrCheck(fs, c) || {}).tone;
  assert.equal(normStreet('Dixie Rd.'), normStreet('Dixie Road'));
  assert.equal(normStreet('Hurontario Street North'), 'hurontario');
  assert.equal(tone(f({ mm: 250, street: 'Dixie Road' }), { kind: 'local', mm: 250, street: 'Dixie Rd' }), 'ok');
  assert.match(fsrCheck(f({ mm: 250, street: 'Dixie Road' }), { kind: 'local', mm: 250, street: 'Dixie Rd' }).text, /p\. 12/);
  assert.equal(tone(f({ mm: 375, street: 'Dixie Road' }), { kind: 'sewer', mm: 250, street: 'Dixie Road' }), 'warn', 'same street, another size');
  assert.equal(tone(f({ mm: 375, street: 'Mayfield Road' }), { kind: 'sewer', mm: 250, street: 'Dixie Road' }), 'bad');
  assert.equal(tone(f({ mm: 375, street: 'Mayfield Road' }, 'low'), { kind: 'sewer', mm: 250, street: 'Dixie Road' }), 'unk', 'a low-confidence read never fails an outlet');
  assert.equal(tone(f({ mm: 250, street: null }), { kind: 'sewer', mm: 250, street: null }), 'ok');
  assert.equal(tone(f({ mm: null, street: 'Mayfield Road', project: '25-2267' }), { kind: 'dc', project: '25-2267' }), 'ok', 'the same Region project');
  assert.equal(tone(f({ mm: 525, street: 'Mayfield Road' }), { kind: 'dc', mm: null, street: null, project: '28-2139' }), 'unk', 'nothing to compare');
  assert.equal(tone(f({ status: 'septic' }, 'medium'), { kind: 'sewer', mm: 250, street: 'Dixie Road' }), 'warn', 'the FSR says septic');
  assert.equal(fsrCheck(null, { kind: 'sewer' }), null);
});

test('wired in: the page, the models and the offline shell', () => {
  assert.match(src('js/sewer-cap.js'), /window\.PeelDevOutlets\.pipeFor\(p\)/);
  assert.match(src('js/sewer-cap.js'), /window\.PeelDevOutlets \? window\.PeelDevOutlets\.version\(\) : 0/, 'the load model re-runs when an outlet changes');
  assert.match(src('js/dc-impact.js'), /DO\.dcRouteFor\(d\.p\)/);
  assert.match(src('js/sewer-trace.js'), /DO\.dcRouteFor\(p\)/);
  assert.match(src('js/sewer-trace.js'), /opts\.cap \? capNearest/, 'a route can start on a sewer being built');
  const html = src('index.html');
  assert.ok(html.indexOf('js/dev-outlets.js') > html.indexOf('js/dc-impact.js'));
  assert.match(src('sw.js'), /'js\/dev-outlets\.js',/);
  assert.match(src('js/workspaces.js'), /\['QA\/QC', \['outlets'\]\]/);
  assert.ok(JSON.parse(src('data/sources.json')).files['dev-outlets.json'] || /"dev-outlets\.json"/.test(src('data/sources.json')));
});
