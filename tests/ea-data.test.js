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
    for (const k of ['purpose', 'decision']) if (e[k]) assert.doesNotMatch(typeof e[k] === 'object' ? e[k].text : e[k], E.CONTACT, `${e.id} ${k}`);
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

// Wording seen on the Region's EA pages (October 2026).
const pg = body => `<main><h1>T</h1>${body.split(' | ').map(l => `<p>${l}</p>`).join('')}</main>`;

test('real page wording: label and date on separate lines', () => {
  const p = E.parsePage(pg('Process | Project Initiation | Summer 2023 | Notice of Study Commencement | December 21, 2023 | We are here, Public Information Centre No.1 | Fall 2025'), 'https://x/gw', { today: '2026-10-15' });
  assert.deepEqual(p.milestones.map(m => [m.type, m.date]), [['commencement', '2023-12-21']]);
  assert.equal(p.status, 'commenced');
});

test('real page wording: "has completed a Class EA" is a completion', () => {
  const p = E.parsePage(pg('Airport Road | Notice of study completion | June 17, 2021 - Peel Region has completed a Class Environmental Assessment (Class EA) Study for Airport Road. | The study was conducted according to the requirements for a Schedule C project.'), 'https://x/ar', { today: '2026-10-15' });
  assert.equal(p.status, 'complete');
  assert.equal(p.schedule, 'C');
  assert.equal(p.completedYear, 2021);
});

test('real page wording: public meeting held; online engagement window gives the next step', () => {
  const held = E.parsePage(pg('Virtual Public Meeting | A Public Meeting was held on November 29, 2023.'), 'https://x/q', { today: '2026-10-15' });
  assert.equal(held.status, 'consultation');
  const open = E.parsePage(pg('Online public engagement | Comments or questions on the study information may be submitted to one of the project team members from September 23, 2026 to October 23, 2026 .'), 'https://x/h50', { today: '2026-10-15' });
  assert.equal(open.status, 'consultation');
  assert.deepEqual(open.nextStep, { text: 'Comment period ends', date: '2026-10-23' });
});

test('real page wording: a study under way with no dates is "commenced", marked as inferred', () => {
  const p = E.parsePage(pg('Complete corridor study | Peel Region is undertaking a Complete Corridor Study and Preliminary Design Improvements to Airport Road.'), 'https://x/a', { today: '2026-10-15' });
  assert.equal(p.status, 'commenced');
  assert.match(p.statusInferred, /page wording/);
  const dated = E.parsePage(pg('Notice of Commencement issued January 15, 2024'), 'https://x/b', { today: '2026-10-15' });
  assert.equal(dated.statusInferred, null);
});

test('real page wording: completed road and pumping-station EAs', () => {
  const road = E.parsePage(pg('Mayfield Road – Airport Road to Coleraine Drive | This environmental assessment has been completed. | The Region of Peel has completed the Schedule "C" Environmental Assessment (EA) for the improvements to Mayfield Road.'), 'https://x/m', { today: '2026-10-15' });
  assert.equal(road.status, 'complete');
  assert.equal(road.schedule, 'C');
  const sps = E.parsePage(pg('Notice of completion | December 5, 2023 – Peel Region has completed a Schedule B Municipal Class Environmental Assessment (MCEA) study to upgrade the McVean Sanitary Pumping Station. | The project file report will be available until Monday January 8, 2024 for the required 30-day comment period.'), 'https://x/mc', { today: '2026-10-15' });
  assert.equal(sps.status, 'complete');
  assert.ok(sps.milestones.some(m => m.type === 'reviewEnd' && m.date === '2024-01-08'));
  assert.equal(sps.completedYear, 2023);
});

test('study-area images, maps and display boards are not taken as the report', () => {
  const d = E.docLinks('<main><a href="/sites/default/files/2025-01/kennedy-study-area.pdf">Study area</a><a href="/sites/default/files/2025-01/pic-boards.pdf">PIC display boards</a><a href="/sites/default/files/2025-09/esr.pdf">Environmental Study Report</a></main>', 'https://peelregion.ca/x');
  assert.equal(d.report.label, 'Environmental Study Report');
});

test('next step text only from an explicit "Next steps:" sentence', () => {
  assert.equal(E.nextStepOf([], ['As part of the next steps, the Region has initiated a Schedule B Municipal Class EA.'], '2026-10-15'), null);
  assert.equal(E.nextStepOf([], ['Next steps will be shared in the Study process.'], '2026-10-15'), null);
  assert.deepEqual(E.nextStepOf([], ['Next steps: The project team will review all comments and finalize the report.'], '2026-10-15'), { text: 'The project team will review all comments and finalize the report.', date: null });
});

test('DC links: no match by a facility name that is also a street, wrong system or a different kind of work', () => {
  const FAC = { water: [
    { name: 'Heritage Road', g: [-79.80, 43.60], items: [{ what: 'New Elevated Tank', proj: '31-1999', phases: [['EA', 2030, '1']] }] },
    { name: 'Victoria', items: [{ what: 'New Pumping Station', proj: '30-1963', phases: [['EA', 2028, '2']] }] },
    { name: 'Arthur P. Kennedy Water Treatment Plant', items: [{ what: 'Treatment Expansion', proj: '29-1925', phases: [['EA', 2025, '3']] }, { what: 'New Intake', proj: '30-1997', phases: [['EA', 2030, '4']] }] },
  ], wastewater: [{ name: 'Clarkson Water Resource Recovery Facility', g: [-79.62, 43.50], items: [{ what: 'Treatment Expansion', proj: '26-2564', phases: [['EA', 2026, '5']] }] }] };
  const link = (name, extra = {}) => E.linkDc({ name, ...extra }, FAC, {}).map(d => d.proj);
  assert.deepEqual(link('Bovaird Drive – Mississauga Road from Lake Louise Drive to 1.45 km west of Heritage Road'), [], 'road EA');
  assert.deepEqual(link('Fair Birch Drive, Queen Victoria Avenue and Lorne Park Road sanitary sewer improvements'), [], 'street names, wastewater EA');
  assert.deepEqual(link('Arthur P. Kennedy Water Treatment Plant reservoir expansion'), [], 'reservoir EA does not take the treatment or intake items');
  assert.deepEqual(link('Arthur P. Kennedy Water Treatment Plant expansion'), ['29-1925', '30-1997']);
  assert.deepEqual(link('Clarkson Wastewater Treatment Plant'), ['26-2564']);
  assert.deepEqual(link('Lower west sanitary trunk sewer twinning', { system: 'wastewater', geomType: 'linear', geometry: { type: 'LineString', coordinates: [[-79.62, 43.50], [-79.61, 43.51]] } }), [], 'a pipe route near a plant is not the plant');
  assert.deepEqual(link('Heritage Road elevated tank', { system: 'water' }), ['31-1999']);
});

test('purpose draft keeps initials and abbreviations inside the sentence', () => {
  assert.equal(E.purposeDraft(['A Schedule C Class Environmental Assessment (EA) will assess G.E. Booth Wastewater Treatment Plant capacity to 2041. Other text follows here.']),
    'A Schedule C Class Environmental Assessment (EA) will assess G.E. Booth Wastewater Treatment Plant capacity to 2041.');
});

test('purpose draft skips process sentences and cuts long ones at a word', () => {
  assert.equal(E.purposeDraft(['Following the 30-day public review of the Environmental Study Report (ESR), the Region will address all comments and finalize the report. The study will identify the preferred water and wastewater servicing for growth in Bolton.']),
    'The study will identify the preferred water and wastewater servicing for growth in Bolton.');
  const long = E.purposeDraft([`The study will assess ${'servicing options for the downtown area and '.repeat(8)}beyond.`]);
  assert.ok(long.length <= 221 && long.endsWith('…') && !/\s…$/.test(long), long);
});

test('study-area trace list: every entry names a listed EA, its map on the ea-maps branch, an outline and enough control points', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ea-trace.json'), 'utf8'));
  const ids = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'eas.json'), 'utf8')).eas.map(e => e.id));
  const seen = new Set();
  for (const t of cfg.traces) {
    assert.ok(ids.has(t.id), `unknown EA ${t.id}`);
    assert.ok(!seen.has(t.id), `traced twice: ${t.id}`); seen.add(t.id);
    assert.ok(t.image.startsWith(`ea-maps/${t.id}/`), t.image);
    assert.ok(['area', 'line'].includes(t.kind), t.kind);
    const o = t.outline;
    assert.ok(o.px?.length >= 2 || o.lines?.length || o.polys?.length || o.rgb, `${t.id}: no outline`);
    if (t.kind === 'area' && o.px) assert.deepEqual(o.px[0], o.px[o.px.length - 1], `${t.id}: ring not closed`);
    // One control point only with the map's scale; two or more otherwise. Each is a pixel and two streets (or a lng/lat).
    assert.ok(t.ctrl.length >= 2 || t.ctrl.length === 1 && t.mPerPx > 0, `${t.id}: ${t.ctrl.length} control points`);
    for (const c of t.ctrl) {
      assert.equal(c.px.length, 2);
      assert.ok(c.lnglat?.length === 2 || c.streets?.length === 2 && c.city, `${t.id}: control point without streets`);
    }
    if (t.rotationDeg !== undefined) assert.ok(Math.abs(t.rotationDeg) <= 180);
  }
  assert.ok(cfg.traces.length >= 40, `only ${cfg.traces.length} traces`);
});

test('study-area tracing: affine fit, outline extraction, street intersections (python self-test)', () => {
  const { spawnSync } = require('child_process');
  const r = spawnSync('python3', [path.join(__dirname, '..', 'scripts', 'ea_trace.py'), '--selftest'], { encoding: 'utf8' });
  if (r.error || /No module named/.test(r.stderr || '')) return;   // python3 / numpy / PIL not installed here
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /selftest ok/);
});
