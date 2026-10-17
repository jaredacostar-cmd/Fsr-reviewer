'use strict';
// EA to construction: construction is an EA's outcome only when it starts after the EA is complete.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/capital-ea-model.js');
const E = require('../scripts/ea-lib.js');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const TODAY = Date.UTC(2026, 9, 17);
const ea = (id, o = {}) => ({ id, name: id, municipality: 'Brampton', status: 'complete', milestones: [], related: { capitalProjects: [] }, ...o });
const rec = (id, o = {}) => ({ id, contract: id, status: 'planned', workType: 'watermain', street: 'Main St', ...o });
const link = (id, method = 'inside the study area') => ({ id, method });

test('a contract that starts before the EA is complete is other work, never the EA’s outcome', () => {
  const e = ea('A', { milestones: [{ type: 'pic', date: '2018-05-01' }, { type: 'completion', date: '2019-06-30' }], related: { capitalProjects: [link('early'), link('after'), link('same-year'), link('nodate')] } });
  const caps = [rec('early', { startActual: '2017-04-01', status: 'complete' }), rec('after', { startTarget: '2027-03-01' }), rec('same-year', { startActual: '2019-08-01', status: 'under construction' }), rec('nodate')];
  const [x] = M.eaProgress([e], caps, TODAY);
  const cls = Object.fromEntries(x.contracts.map(c => [c.key, c.cls]));
  assert.deepEqual(cls, { early: 'other', after: 'outcome', 'same-year': 'outcome', nodate: 'unknown' });
  assert.equal(x.bucket, 'building');
  for (const c of x.outcome) assert.ok(c.start >= x.d.completion.at, `${c.key} starts on or after the EA`);
});

test('only the year known: a start in the completion year counts, an earlier year does not', () => {
  const d = M.eaDates(ea('B', { completedYear: 2020 }));
  assert.equal(d.completion.exact, false);
  assert.equal(M.classifyLink(d, { start: Date.UTC(2020, 0, 5), strength: 2 }), 'outcome');
  assert.equal(M.classifyLink(d, { start: Date.UTC(2019, 11, 20), strength: 2 }), 'other');
  // The project's own page links it: a start before the EA is a date conflict to check.
  assert.equal(M.classifyLink(d, { start: Date.UTC(2019, 11, 20), strength: 3 }), 'conflict');
  // No completion date: can't be ordered.
  assert.equal(M.classifyLink(M.eaDates(ea('C')), { start: Date.UTC(2025, 0, 1), strength: 2 }), 'unknown');
});

test('an EA under way: only construction due after the expected report is its outcome', () => {
  const d = M.eaDates(ea('D', { status: 'consultation', milestones: [{ type: 'pic', date: '2025-03-01' }, { type: 'report', date: '2027-02' }] }));
  assert.equal(d.complete, false);
  assert.equal(M.classifyLink(d, { start: Date.UTC(2028, 3, 1), strength: 2 }), 'outcome');
  assert.equal(M.classifyLink(d, { start: Date.UTC(2024, 3, 1), startActual: true, strength: 2 }), 'other');
});

test('buckets: waiting, waiting 9+ years, built, date unknown, under way', () => {
  const caps = [rec('done', { startActual: '2018-01-01', substantialActual: '2019-06-01', status: 'complete' })];
  const list = M.eaProgress([
    ea('wait', { completedYear: 2022 }),
    ea('old', { completedYear: 2016 }),
    ea('built', { completedYear: 2017, related: { capitalProjects: [link('done')] } }),
    ea('nodate'),
    ea('now', { status: 'consultation' }),
  ], caps, TODAY);
  assert.deepEqual(Object.fromEntries(list.map(x => [x.e.id, x.bucket])), { wait: 'waiting', old: 'limit', built: 'built', nodate: 'nodate', now: 'current' });
  assert.deepEqual(M.BUCKETS.map(b => b[0]), ['limit', 'waiting', 'planned', 'building', 'built', 'current', 'nodate']);
});

test('the timeline row: fractions of the range, works after the EA', () => {
  const caps = [rec('w', { startTarget: '2028-01-01', substantialTarget: '2029-01-01' })];
  const [x] = M.eaProgress([ea('T', { milestones: [{ type: 'pic', date: '2020-01-01' }, { type: 'completion', date: '2022-01-01' }], related: { capitalProjects: [link('w')] } })], caps, TODAY);
  const t = M.timelineRow(x, Date.UTC(2020, 0, 1), Date.UTC(2030, 0, 1));
  assert.equal(t.ea.a, 0);
  assert.ok(Math.abs(t.done - 0.2) < 0.01);
  assert.equal(t.works.length, 1);
  assert.ok(t.works[0].a > t.done && t.works[0].planned);
});

test('completion year: the best evidence first, never before the EA began or after today', () => {
  const today = new Date('2026-10-17');
  assert.deepEqual(E.completionOf({ milestones: [{ type: 'pic', date: '2019-05-01' }, { type: 'completion', date: '2021-03-01' }], today }), { year: 2021, basis: 'notice of completion' });
  assert.deepEqual(E.completionOf({ milestones: [{ type: 'reviewEnd', date: '2020-11-30' }], today }), { year: 2020, basis: 'report filed' });
  assert.deepEqual(E.completionOf({ body: 'The study was completed in March 2018 and is available below.', today }), { year: 2018, basis: 'page wording' });
  assert.deepEqual(E.completionOf({ reportText: 'Environmental Study Report\nFinal\nJune 2017\nPrepared for the Region', today }), { year: 2017, basis: 'report cover' });
  assert.deepEqual(E.completionOf({ report: { label: 'ESR', url: 'https://example.org/esr-final-april-2016.pdf' }, today }), { year: 2016, basis: 'report file name' });
  // A year before the first PIC, or after today, is not the completion.
  assert.equal(E.completionOf({ milestones: [{ type: 'pic', date: '2022-01-01' }], body: 'completed in 2015', today }), null);
  assert.equal(E.completionOf({ body: 'to be completed in 2029', today }), null);
});

test('Home pages: EA to construction (Capital) and Forecast (Planning), reachable from Home', () => {
  const s = src('js/ws-pages.js');
  assert.match(s, /function eaflow\(\) \{/);
  assert.match(s, /function outlook\(\) \{\s*const t = specOf\('growth:timing', areaScope\);/);
  assert.match(s, /data-ws-page="outlook">Forecast →<\/button> <button type="button" class="btn small link" data-ws-page="eaflow">EA to construction →<\/button>/);
  // The outcome list only holds construction the model calls the EA's outcome.
  assert.match(s, /followed\.flatMap\(x => x\.outcome\.map\(/);
  // No colours in the page code: tokens in css/app.css.
  const body = s.slice(s.indexOf('function eaflow'), s.indexOf('// ---- This week'));
  assert.doesNotMatch(body, /#[0-9a-f]{3,6}\b/i);
  assert.doesNotMatch(src('css/app.css').split('/* EA to construction')[1] || 'x', /#[0-9a-f]{3,6}\b/i);
});

test('possible links: current work near a past EA, same system and municipality, after it, not yet linked', () => {
  // A line EA along Main Street (Brampton), completed 2015.
  const g = { type: 'LineString', coordinates: [[-79.70, 43.70], [-79.68, 43.70]] };
  const e = ea('P', { system: 'water', geometry: g, geomConfidence: 'medium', name: 'Main Street watermain', completedYear: 2015, related: { capitalProjects: [link('linked')] } });
  const line = dy => ({ type: 'LineString', coordinates: [[-79.695, 43.70 + dy], [-79.690, 43.70 + dy]] });
  const caps = [
    rec('near', { system: 'water', workType: 'WM', street: 'MAIN ST', municipality: 'BRAMPTON', startTarget: '2027-05-01', geometry: line(0.001) }),       // ≈110 m
    rec('far', { system: 'water', workType: 'WM', municipality: 'BRAMPTON', startTarget: '2027-05-01', geometry: line(0.01) }),                          // ≈1.1 km
    rec('sewer', { system: 'wastewater', workType: 'SAN', municipality: 'BRAMPTON', startTarget: '2027-05-01', geometry: line(0) }),                    // other system
    rec('reline', { system: 'water', workType: 'WM-RELINING', municipality: 'BRAMPTON', startTarget: '2027-05-01', geometry: line(0) }),                // a repair
    rec('before', { system: 'water', workType: 'WM', municipality: 'BRAMPTON', startActual: '2012-05-01', status: 'under construction', geometry: line(0) }), // before the EA
    rec('mis', { system: 'water', workType: 'WM', municipality: 'MISSISSAUGA', startTarget: '2027-05-01', geometry: line(0) }),                         // other municipality
    rec('done', { system: 'water', workType: 'WM', municipality: 'BRAMPTON', status: 'complete', startActual: '2018-05-01', geometry: line(0) }),         // finished
    rec('linked', { system: 'water', workType: 'WM', municipality: 'BRAMPTON', startTarget: '2027-05-01', geometry: line(0) }),                         // already linked
  ];
  const L = M.possibleLinks([e], caps, TODAY);
  assert.deepEqual(L.map(x => x.c.key), ['near']);
  assert.equal(L[0].street, true);
  assert.equal(L[0].dateChecked, true);
  assert.ok(L[0].metres > 80 && L[0].metres < 140, `${L[0].metres} m`);
  // A study area placed with low confidence needs the street named in the EA too; Region-wide studies never match.
  assert.equal(M.possibleLinks([{ ...e, geomConfidence: 'low', name: 'Some study' }], caps, TODAY).length, 0);
  assert.equal(M.possibleLinks([{ ...e, municipality: 'Region-wide' }], caps, TODAY).length, 0);
  assert.equal(M.sameStreetAs('50 HY', 'Highway 50 drainage improvements'), true);
  assert.equal(M.metresTo([-79.69, 43.70], { type: 'Polygon', coordinates: [[[-79.7, 43.69], [-79.68, 43.69], [-79.68, 43.71], [-79.7, 43.71], [-79.7, 43.69]]] }), 0);
});
