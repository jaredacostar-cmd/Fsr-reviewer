'use strict';
// Environmental assessments data (Stage 1c): list parsing and de-duplication, project-page
// reading (schedule, milestones, status, next step, documents), privacy, geometry by type,
// links, overrides, page-hash change list and the review CSV.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const E = require('../scripts/ea-lib.js');

const LIST = `<html><body><nav><ul><li><a href="/home">Home</a></li><li>Garbage and recycling services</li></ul></nav>
<main><h1>List of environment assessments</h1>
<h2>Brampton</h2><ul>
 <li>Mayfield Road – Hurontario Street to Chinguacousy Road</li>
 <li><a href="/public-works/environmental-assessments/brampton/east-to-west-diversion.asp">East-to-West Diversion Sanitary Trunk Sewer</a></li>
 <li>Queen Street East Watermain Class EA</li>
</ul>
<h2>Caledon</h2><ul>
 <li>Mayfield Road - Hurontario Street to Chinguacousy Road</li>
 <li>Bolton Water and Wastewater Servicing</li>
 <li>Snelgrove Elevated Tank</li>
</ul>
<h3>Mississauga</h3><ul><li>Lakeview Water Resource Recovery Facility Expansion</li></ul>
<p>For more information contact Jane Doe at 905-791-7800 ext. 1234 or jane.doe@peelregion.ca</p>
</main><footer><ul><li>Privacy statement</li></ul></footer></body></html>`;

test('list page: names under municipality headings, navigation ignored, repeats merged', () => {
  const items = E.parseList(LIST, 'https://peelregion.ca/construction/environmental-assessments/list-of-environment-assessments');
  assert.deepEqual(items.map(i => i.name), [
    'Mayfield Road – Hurontario Street to Chinguacousy Road', 'East-to-West Diversion Sanitary Trunk Sewer', 'Queen Street East Watermain Class EA',
    'Bolton Water and Wastewater Servicing', 'Snelgrove Elevated Tank', 'Lakeview Water Resource Recovery Facility Expansion']);
  assert.deepEqual(items[0].municipalities, ['Brampton', 'Caledon'], 'repeated under two municipalities → one EA');
  assert.equal(items[1].href, 'https://peelregion.ca/public-works/environmental-assessments/brampton/east-to-west-diversion.asp');
  assert.deepEqual(items[5].municipalities, ['Mississauga']);
  assert.ok(!JSON.stringify(items).includes('Jane'), 'no contact names');
});

test('project page found by name when the list has no link', () => {
  const c = [{ url: 'https://peelregion.ca/public-works/environmental-assessments/caledon/bolton.asp', label: 'Bolton Water and Wastewater Servicing Class EA' }, { url: 'https://peelregion.ca/x/snelgrove.asp', label: 'Snelgrove' }];
  assert.equal(E.findPage('Bolton Water and Wastewater Servicing', c).url, c[0].url);
  assert.equal(E.findPage('Snelgrove Elevated Tank', c).url, c[1].url);
  assert.equal(E.findPage('Cawthra Road Sanitary Sewer', c), null);
});

test('system, schedule classification', () => {
  assert.equal(E.systemOf('Queen Street East Watermain Class EA'), 'water');
  assert.equal(E.systemOf('East-to-West Diversion Sanitary Trunk Sewer'), 'wastewater');
  assert.equal(E.systemOf('Lakeview Water Resource Recovery Facility Expansion'), 'wastewater');
  assert.equal(E.systemOf('Bolton Water and Wastewater Servicing'), 'multi');
  assert.equal(E.systemOf('Mayfield Road – Hurontario Street to Chinguacousy Road'), 'roads');
  assert.equal(E.systemOf('Fletchers Creek Stormwater Management'), 'storm');
  assert.equal(E.systemOf('Snelgrove Elevated Tank'), 'water');
  assert.equal(E.scheduleOf('This study follows Schedule C of the Municipal Class EA'), 'C');
  assert.equal(E.scheduleOf('a Schedule ‘B’ project'), 'B');
  assert.equal(E.scheduleOf('Schedule A+ activity'), 'A+');
  assert.equal(E.scheduleOf('Water and Wastewater Master Plan'), 'master plan');
  assert.equal(E.scheduleOf('Individual Environmental Assessment under Part II.3'), 'IEA');
  assert.equal(E.scheduleOf('nothing here'), 'unknown');
  for (const s of ['water', 'wastewater', 'roads', 'storm', 'multi']) assert.ok(E.SYSTEMS.includes(s));
});

test('dates in text', () => {
  assert.deepEqual(E.datesIn('Held on March 4, 2025 and 12 June 2025; report Sept. 2025; 2026-01-15').map(d => d.date), ['2025-03-04', '2025-06-12', '2025-09', '2026-01-15']);
});

const PAGE = (extra = '') => `<html><body><header>Menu</header><main><h1>Bolton Water and Wastewater Servicing Class EA</h1>
<p>The Region of Peel is undertaking a Schedule C Municipal Class Environmental Assessment study to identify the preferred water and wastewater servicing for growth in Bolton.</p>
<h2>Study timeline</h2><ul>
<li>Notice of Commencement issued: January 15, 2024</li>
<li>Public Information Centre #1: June 5, 2024</li>
<li>Public Information Centre #2: February 20, 2025</li>
${extra}
</ul>
<h2>Documents</h2><ul>
<li><a href="/sites/default/files/2024-01/bolton-notice-of-commencement.pdf">Notice of Commencement (PDF)</a></li>
<li><a href="/sites/default/files/2025-02/bolton-pic2-boards.pdf">PIC 2 display boards</a></li>
${extra.includes('Completion') ? '<li><a href="/sites/default/files/2025-09/bolton-esr.pdf">Environmental Study Report</a></li><li><a href="/sites/default/files/2025-09/bolton-esr-appendix-a.pdf">Appendix A – Natural Heritage</a></li><li><a href="/sites/default/files/2025-09/bolton-notice-of-completion.pdf">Notice of Study Completion</a></li>' : ''}
</ul>
<h2>Contact</h2><p>Project Manager: John Smith, P.Eng., 905-791-7800 ext. 4444, john.smith@peelregion.ca</p>
</main><footer>Footer</footer></body></html>`;

test('project page: schedule, milestones, consultation status, purpose; no contact details', () => {
  const p = E.parsePage(PAGE(), 'https://peelregion.ca/public-works/environmental-assessments/caledon/bolton.asp', { today: '2025-06-01' });
  assert.equal(p.schedule, 'C');
  assert.deepEqual(p.milestones, [{ type: 'commencement', date: '2024-01-15' }, { type: 'pic', date: '2024-06-05' }, { type: 'pic', date: '2025-02-20' }]);
  assert.equal(p.status, 'consultation');
  assert.match(p.purpose, /identify the preferred water and wastewater servicing/);
  assert.equal(p.links.notices.length, 1);
  const out = JSON.stringify({ ...p, bodyText: undefined });
  assert.ok(!/John|Smith|905-791|@peelregion/.test(out), 'no contact names or numbers');
});

test('status: report review while the review period is open, then complete; addendum', () => {
  const extra = '<li>Notice of Study Completion: September 10, 2025. The 30-day review period runs from September 10, 2025 to October 10, 2025.</li>';
  const open = E.parsePage(PAGE(extra), 'https://x/bolton', { today: '2025-09-20' });
  assert.equal(open.status, 'report review');
  assert.deepEqual(open.nextStep, { text: 'Review period ends', date: '2025-10-10' });
  assert.equal(open.links.report.url, 'https://x/sites/default/files/2025-09/bolton-esr.pdf');
  assert.equal(open.links.appendices.length, 1);
  assert.equal(open.links.notices.length, 2);
  const done = E.parsePage(PAGE(extra), 'https://x/bolton', { today: '2025-11-01' });
  assert.equal(done.status, 'complete');
  assert.equal(done.completedYear, 2025);
  assert.equal(done.nextStep, null);
  const add = E.parsePage(PAGE(extra + '<li>ESR Addendum notice issued March 3, 2026</li>'), 'https://x/bolton', { today: '2026-04-01' });
  assert.equal(add.status, 'addendum');
  assert.equal(E.statusOf([], { today: '2025-01-01' }), 'unknown');
  assert.equal(E.statusOf([{ type: 'commencement', date: '2024-01-01' }], { today: '2025-01-01' }), 'commenced');
});

test('next step: the next dated milestone ahead', () => {
  const ms = [{ type: 'commencement', date: '2025-01-10' }, { type: 'pic', date: '2026-11-20' }];
  assert.deepEqual(E.nextStepOf(ms, [], '2026-10-15'), { text: 'Public information centre', date: '2026-11-20' });
  assert.equal(E.nextStepOf(ms, ['Next steps: contact John at 905-555-1234'], '2027-01-01'), null, 'contact lines never become a next step');
});

test('road names parse into road, from and to', () => {
  assert.deepEqual(E.parseRoad('Mayfield Road – Hurontario Street to Chinguacousy Road'), { road: 'Mayfield Road', from: 'Hurontario Street', to: 'Chinguacousy Road' });
  assert.deepEqual(E.parseRoad('Bovaird Drive from Mississauga Road to Heritage Road Class EA'), { road: 'Bovaird Drive', from: 'Mississauga Road', to: 'Heritage Road' });
  assert.deepEqual(E.parseRoad('Dixie Road (Queen Street to Mayfield Road)'), { road: 'Dixie Road', from: 'Queen Street', to: 'Mayfield Road' });
  assert.equal(E.parseRoad('Snelgrove Elevated Tank'), null);
});

// East–west road along 43.70 with cross streets at -79.74 and -79.72.
const ROAD = { road: [[[-79.76, 43.70], [-79.73, 43.70]], [[-79.73, 43.70], [-79.70, 43.70]]], from: [[[-79.74, 43.69], [-79.74, 43.71]]], to: [[[-79.72, 43.69], [-79.72, 43.71]]] };

test('road centreline between cross streets (chained OSM ways)', () => {
  const r = E.roadBetween(ROAD);
  assert.equal(r.confidence, 'high');
  const xs = r.geometry.coordinates.map(c => c[0]);
  assert.ok(Math.abs(Math.min(...xs) - -79.74) < 0.0003 && Math.abs(Math.max(...xs) - -79.72) < 0.0003, xs.join());
  assert.equal(E.roadBetween({ road: ROAD.road, from: ROAD.from, to: [[[-79.5, 43.9], [-79.5, 43.91]]] }), null, 'cross street not on the road');
});

const CTX = {
  facilities: [{ name: 'Snelgrove', lnglat: [-79.83, 43.75] }, { name: 'G.E. Booth Water Resource Recovery Facility', lnglat: [-79.55, 43.57], aliases: ['Lakeview'] }],
  dcLines: [{ name: 'East-to-West Diversion Sanitary Trunk Sewer', paths: [[[-79.70, 43.75], [-79.68, 43.75]]] }],
  capital: [{ street: 'Queen St E', system: 'water', geometry: { type: 'LineString', coordinates: [[-79.70, 43.69], [-79.69, 43.69]] } }],
  areas: [{ name: 'Bolton', municipality: 'Caledon', rings: [[[-79.75, 43.86], [-79.70, 43.86], [-79.70, 43.90], [-79.75, 43.90], [-79.75, 43.86]]] }],
  roadWays: () => ROAD,
  place: () => null,
};

test('geometry by type in order: facility, road, linear, area, approximate', () => {
  const g = n => E.resolveGeometry({ name: n, municipalities: ['Caledon'] }, CTX);
  assert.deepEqual([g('Snelgrove Elevated Tank').geomType, g('Snelgrove Elevated Tank').geomConfidence], ['facility', 'high']);
  assert.equal(g('Lakeview Water Resource Recovery Facility Expansion').geomType, 'facility');
  const rd = g('Mayfield Road – Hurontario Street to Chinguacousy Road');
  assert.equal(rd.geomType, 'road');
  assert.match(rd.geomMethod, /OpenStreetMap/);
  assert.equal(g('East-to-West Diversion Sanitary Trunk Sewer').geomType, 'linear');
  assert.equal(g('Queen Street East Watermain Class EA').geomMethod, 'capital project lines on the named street');
  assert.deepEqual([g('Bolton Water and Wastewater Servicing').geomType, g('Bolton Water and Wastewater Servicing').geometry.type], ['area', 'Polygon']);
  const ap = g('Something Unplaceable');
  assert.deepEqual([ap.geomType, ap.geomConfidence, ap.geomMethod], ['approx', 'low', 'municipality centre: Caledon']);
  const pl = E.resolveGeometry({ name: 'Somewhere', municipalities: [] }, { ...CTX, place: () => ({ lnglat: [-79.8, 43.8], label: 'Inglewood' }) });
  assert.equal(pl.geomMethod, 'approximate point: Inglewood');
  for (const t of ['facility', 'linear', 'road', 'area', 'approx']) assert.ok(E.GEOM_TYPES.includes(t));
});

test('links: DC projects with an EA phase by name or location; capital by DC match, website or street in the study area', () => {
  const FAC = { water: [
    { name: 'Snelgrove', items: [{ what: 'New Elevated Tank', proj: '30-1946', phases: [['EA', 2026, '1'], ['C', 2030, '2']] }, { what: 'Paint', proj: '26-0001', phases: [['C', 2026, '3']] }] },
    { name: 'Sandhill', g: [-79.7, 43.88], items: [{ what: 'New Reservoir', proj: '28-1945', phases: [['EA', 2026, '4']] }] },
  ], wastewater: [] };
  const bolton = { name: 'Bolton Water and Wastewater Servicing', geometry: { type: 'Polygon', coordinates: CTX.areas[0].rings }, links: { page: 'https://peelregion.ca/public-works/environmental-assessments/caledon/bolton.asp' } };
  assert.deepEqual(E.linkDc({ name: 'Snelgrove Elevated Tank', geometry: null }, FAC, {}).map(d => [d.proj, d.method]), [['30-1946', 'name']], 'only items with an EA phase');
  assert.deepEqual(E.linkDc(bolton, FAC, {}).map(d => [d.proj, d.method]), [['28-1945', 'location']]);
  const capital = {
    records: [
      { id: 'c1', projectNumber: '30-1946', street: 'Tank Rd', geometry: null },
      { id: 'c2', projectNumber: '27-0002', website: 'http://www.peelregion.ca/public-works/environmental-assessments/caledon/bolton.asp/', geometry: null },
      { id: 'c3', projectNumber: '27-0003', street: 'Bolton Rd', geometry: { type: 'LineString', coordinates: [[-79.74, 43.87], [-79.72, 43.87]] } },
      { id: 'c4', projectNumber: '27-0004', street: 'Elsewhere Rd', geometry: { type: 'LineString', coordinates: [[-79.74, 43.87], [-79.72, 43.87]] } },
    ],
    links: [{ dc: 'water:fac:Snelgrove:30-1946:New Elevated Tank', capital: 'c1', method: 'component', confidence: 'high' }],
  };
  assert.deepEqual(E.linkCapital({ name: 'Snelgrove Elevated Tank' }, capital, [{ proj: '30-1946' }]).map(c => [c.id, c.method]), [['c1', 'dc match']]);
  assert.deepEqual(E.linkCapital(bolton, capital, []).map(c => [c.id, c.method]), [['c2', 'project website'], ['c3', 'street + study area']]);
});

test('overrides: purpose, decision and traced boundaries apply; remove and add', () => {
  const eas = [{ id: 'bolton', name: 'Bolton', geomType: 'approx', geomMethod: 'municipality centre: Caledon', geomConfidence: 'low' }, { id: 'gone', name: 'Gone' }];
  const ring = [[[-79.75, 43.86], [-79.70, 43.86], [-79.70, 43.90], [-79.75, 43.86]]];
  const out = E.applyOverrides(eas, { eas: { bolton: { purpose: 'Plan water and wastewater servicing for Bolton growth.', decision: 'New trunk sewer and reservoir.', geometry: { type: 'Polygon', coordinates: ring } } }, remove: ['gone'], add: [{ id: 'new', name: 'New EA' }] });
  assert.deepEqual(out.map(e => e.id), ['bolton', 'new']);
  assert.equal(out[0].purpose, 'Plan water and wastewater servicing for Bolton growth.');
  assert.deepEqual([out[0].geomType, out[0].geomMethod, out[0].geomConfidence], ['area', 'traced from the project page image', 'medium']);
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'eas-overrides.json'), 'utf8'));
  assert.deepEqual([typeof file.eas, Array.isArray(file.add), Array.isArray(file.remove)], ['object', true, true]);
});

test('weekly page-hash check → change list', () => {
  const prev = { eas: [{ id: 'a', name: 'A', pageHash: 'h1', status: 'consultation', links: { notices: [{ url: 'n1', label: 'Notice of Commencement' }] } }, { id: 'b', name: 'B', pageHash: 'h2', status: 'consultation', links: { notices: [] } }] };
  const now = [
    { id: 'a', name: 'A', pageHash: 'h1b', status: 'report review', links: { notices: [{ url: 'n1', label: 'Notice of Commencement' }, { url: 'n2', label: 'Notice of Completion' }] } },
    { id: 'b', name: 'B', pageHash: 'h2', status: 'consultation', links: { notices: [] } },
    { id: 'c', name: 'C', pageHash: 'h3' },
  ];
  assert.deepEqual(E.changesSince(prev, now, '2026-10-19'), [
    { id: 'a', name: 'A', change: 'new notice: Notice of Completion', date: '2026-10-19' },
    { id: 'c', name: 'C', change: 'new EA on the list', date: '2026-10-19' },
  ]);
  assert.deepEqual(E.changesSince(null, now, '2026-10-19'), [], 'first build: no change list');
  assert.equal(E.pageHash('Text\nLast updated: May 1, 2026'), E.pageHash('Text\nLast updated: June 3, 2026'), '"last updated" lines ignored');
});

test('review CSV: one row per EA with the review columns', () => {
  const csv = E.reviewCsv([{ id: 'a', name: 'Road, "X" – A to B', status: 'complete', milestones: [{ type: 'completion', date: '2025-09-10' }], geomType: 'road', geomMethod: 'm', geomConfidence: 'high', related: { dcProjects: [], capitalProjects: [], facilities: [] }, flags: [] }]);
  const [head, row] = csv.trim().split('\n');
  assert.match(head, /^id,name,municipality,system,schedule,status,commencement,pic,completion,review_end,next_step,next_step_date,purpose_draft,decision,page,report,geom_type,geom_method,geom_confidence,dc_matches,capital_matches,facility_matches,flags$/);
  assert.match(row, /^a,"Road, ""X"" – A to B",/);
  assert.match(row, /2025-09-10/);
});

test('data/eas.json (when built): every EA has a status and geometry or a flag; no contact details', () => {
  const f = path.join(__dirname, '..', 'data', 'eas.json');
  if (!fs.existsSync(f)) return;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.match(j.note, /General screening results only\. Peel's W&WW Infrastructure Planning team must validate or confirm all results\./);
  for (const e of j.eas) {
    assert.ok(E.STATUSES.includes(e.status), `${e.id} status ${e.status}`);
    assert.ok(e.geometry || (e.flags || []).length, `${e.id} geometry or flag`);
    assert.ok(E.GEOM_TYPES.includes(e.geomType));
    for (const k of ['purpose', 'decision']) if (e[k]) assert.doesNotMatch(e[k], E.CONTACT, `${e.id} ${k}`);
  }
  assert.doesNotMatch(JSON.stringify(j), /@peelregion\.ca|\b\d{3}-\d{3}-\d{4}\b/);
});

test('list page: explanatory sentences are not EA names', () => {
  const html = `<main><h2>Brampton</h2><ul><li>Dixie Road – Queen Street Drive to Mayfield Road</li><li>An environmental assessment (EA) is a study.</li><li>Schedule C projects must go through a 5-phased environmental assessment process.</li></ul></main>`;
  assert.deepEqual(E.parseList(html, 'https://peelregion.ca/x').map(i => i.name), ['Dixie Road – Queen Street Drive to Mayfield Road']);
});

test('a month-only date is dropped when the same milestone has the full date', () => {
  assert.deepEqual(E.milestonesOf(['Notice of Commencement: June 2023', 'Notice of Commencement issued June 22, 2023']), [{ type: 'commencement', date: '2023-06-22' }]);
});

test('road EAs are not placed on an area boundary that shares a word with a cross street', () => {
  const ctx = { ...CTX, areas: [{ name: 'Heart Lake', rings: CTX.areas[0].rings }], roadWays: () => null };
  const g = E.resolveGeometry({ name: 'Mayfield Road – Chinguacousy Road to Heart Lake Road', municipalities: ['Brampton'] }, ctx);
  assert.equal(g.geomType, 'approx');
  const sp = E.resolveGeometry({ name: 'Arterial roads within Bolton secondary plan area', municipalities: ['Caledon'] }, CTX);
  assert.equal(sp.geomType, 'area');
});
