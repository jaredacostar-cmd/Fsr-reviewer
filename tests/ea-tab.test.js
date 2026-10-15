'use strict';
// Capital › EAs (js/capital-ea-model.js): filters, sorting, scope (municipality, near a site),
// coming-up milestones, open comment periods, the calendar file and the tab HTML.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/capital-ea-model.js');

const sq = (x, y, d) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
const EAS = [
  { id: 'a', name: 'Queen St watermain', system: 'water', status: 'consultation', schedule: 'B', municipality: 'Brampton', milestones: [{ type: 'pic', date: '2026-10-20' }, { type: 'commentEnd', date: '2026-11-05' }], nextStep: { text: 'Comment period ends', date: '2026-11-05' }, geometry: sq(-79.76, 43.68, 0.01), geomType: 'area', geomConfidence: 'medium', geomMethod: 'traced from the project page', links: { page: 'https://peelregion.ca/a' }, purpose: 'Replace the watermain' },
  { id: 'b', name: 'Bolton trunk sewer', system: 'wastewater', status: 'commenced', schedule: 'C', municipality: 'Caledon', milestones: [{ type: 'report', date: '2026-12' }], nextStep: { text: 'Report released', date: '2026-12' }, geometry: { type: 'Point', coordinates: [-79.73, 43.88] }, geomType: 'facility', geomConfidence: 'high', links: {} },
  { id: 'c', name: 'Dixie Rd widening', system: 'roads', status: 'complete', completedYear: 2025, schedule: 'C', municipality: 'Mississauga', milestones: [{ type: 'completion', date: '2025-03-01' }], nextStep: null, geometry: { type: 'LineString', coordinates: [[-79.60, 43.60], [-79.60, 43.62]] }, geomType: 'road', geomConfidence: 'medium', links: { report: { url: 'https://peelregion.ca/c.pdf', label: 'ESR' } } },
  { id: 'd', name: 'Region-wide water master plan', system: 'multi', status: 'complete', completedYear: 2020, schedule: 'master plan', municipality: 'Region-wide', milestones: [], nextStep: null, geometry: null, geomType: 'approx', geomConfidence: 'low', geomMethod: 'none', links: {} },
];

test('filters: status, system (multi counts as water or wastewater), search', () => {
  const ids = f => EAS.filter(e => M.eaMatch(e, f)).map(e => e.id);
  assert.deepEqual(ids({ show: 'current' }), ['a', 'b']);
  assert.deepEqual(ids({ show: 'complete' }), ['c', 'd']);
  assert.deepEqual(ids({ show: 'all', sys: { roads: false } }), ['a', 'b', 'd']);
  assert.deepEqual(ids({ show: 'all', sys: { water: false } }), ['b', 'c', 'd'], 'multi stays while wastewater is on');
  assert.deepEqual(ids({ show: 'all', sys: { water: false, wastewater: false } }), ['c']);
  assert.deepEqual(ids({ show: 'all', q: 'watermain' }), ['a'], 'search reads the purpose too');
  assert.deepEqual(ids({ show: 'all', q: 'caledon' }), ['b']);
});

test('sorting: next step first (current before complete), name, completed year', () => {
  assert.deepEqual(M.eaSort(EAS, 'next').map(e => e.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(M.eaSort(EAS, 'name').map(e => e.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(M.eaSort(EAS, 'completed').map(e => e.id).slice(0, 2), ['c', 'd']);
});

test('near a site: distance to the study area, route or point; inside an area is 0', () => {
  assert.equal(M.geomDistM(EAS[0].geometry, 43.685, -79.755), 0);
  const d = M.geomDistM(EAS[0].geometry, 43.685, -79.745);   // ~0.005° east of the area's east edge
  assert.ok(d > 350 && d < 450, `${d}`);
  assert.ok(Math.abs(M.geomDistM(EAS[2].geometry, 43.61, -79.59) - 806) < 20);
  assert.deepEqual(M.easNear(EAS, 43.685, -79.755, 1000).map(x => x.e.id), ['a']);
  assert.deepEqual(M.easNear(EAS, 43.0, -79.0, 1000), [], 'nothing near');
});

test('coming up: dated milestones in the window (month-only from its month); open comment periods', () => {
  const up = M.upcoming(EAS, '2026-10-15', 90);
  assert.deepEqual(up.map(x => `${x.e.id}:${x.m.type}`), ['a:pic', 'a:commentEnd', 'b:report']);
  assert.equal(up[2].monthOnly, true);
  assert.deepEqual(M.openPeriods(EAS, '2026-10-15').map(x => x.e.id), ['a']);
  assert.deepEqual(M.upcoming(EAS, '2026-10-15', 3), [], 'nothing within 3 days');
});

test('calendar file: all-day events for dated milestones, escaped text, month-only left out', () => {
  const ics = M.eaICS(M.upcoming(EAS, '2026-10-15', 90), '2026-10-15T12:00:00.000Z');
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2, 'the month-only report date is not an event');
  assert.match(ics, /DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021/);
  assert.match(ics, /SUMMARY:Public information centre: Queen St watermain/);
  assert.match(ics, /URL:https:\/\/peelregion\.ca\/a/);
  assert.match(ics, /DTSTAMP:20261015T120000Z/);
  assert.ok(ics.split('\r\n').every(l => l.length <= 75), 'lines folded');
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('tab HTML: tiles, coming up, list with filters, outputs; scoped to a municipality or a site', () => {
  const html = M.eaTabHTML({ eas: EAS, f: { show: 'all' }, sort: 'next', today: '2026-10-15', thisYear: 2026, checked: '2026-10-15', screenNote: '<p>General screening results only.</p>' });
  assert.match(html, /4 listed, project pages checked Oct 15, 2026/);
  assert.match(html, /<b>2<\/b><span>current/);
  assert.match(html, /<b>3<\/b><span>milestones in the next 90 days/);
  assert.match(html, /dca-tile warn"><b>1<\/b><span>comment or review period open now/);
  for (const a of ['data-eatab-q', 'data-eatab-show="current"', 'data-eatab-sys="storm"', 'data-eatab-sort', 'data-eatab-csv', 'data-eatab-geo', 'data-eatab-ics', 'data-eatab-map']) assert.ok(html.includes(a), a);
  assert.equal((html.match(/class="ea-row"/g) || []).length, 4);
  assert.match(html, /not on the map yet/, 'the unplaced EA says so');
  assert.match(html, /approximate location/);
  assert.match(html, /Report ↗/);
  assert.match(html, /General screening results only/);
  const bram = M.eaTabHTML({ eas: EAS, f: { show: 'all' }, today: '2026-10-15', thisYear: 2026, muni: 'Brampton' });
  assert.match(bram, /in Brampton: 2 listed/, 'Brampton plus the Region-wide plan');
  const site = M.eaTabHTML({ eas: EAS, f: { show: 'all' }, today: '2026-10-15', thisYear: 2026, near: { title: '1 Main St', lat: 43.685, lng: -79.755, m: 1000 } });
  assert.match(site, /within 1 km of 1 Main St: 1 listed/);
  assert.match(site, /covers the site/);
  assert.match(M.eaTabHTML({ eas: EAS, today: '2026-10-15', thisYear: 2026, near: { title: 'Far', lat: 43, lng: -79, m: 1000 } }), /No environmental assessments mapped within 1 km of Far/);
  assert.ok(!/<img|<script/i.test(M.eaTabHTML({ eas: [{ ...EAS[0], name: '<img onerror=x>' }], today: '2026-10-15', thisYear: 2026, f: { show: 'all' } })), 'names are escaped');
});
