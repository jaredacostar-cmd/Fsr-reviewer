'use strict';
// No one's name from the council agendas and minutes (js/privacy.js): staff, councillors, residents,
// delegations, letter writers and individual owners. The role stays, so an item still reads.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const P = require('../js/privacy.js');

test('names go, roles and firms stay', () => {
  const cases = [
    ['Moved By Councillor J. Kovac Seconded By Councillor M. Mahoney That Recommendations PDC-0019-2024', 'Moved By Councillor Seconded By Councillor That Recommendations PDC-0019-2024'],
    ['Staff Report by Aferdita Dzaferovska, Strategic Leader, Project Management', 'Staff Report by Strategic Leader, Project Management'],
    ['Correspondence from Charles Cheyne, Brampton resident, dated November 5, 2020, re: Application', 'Correspondence from a Brampton resident, dated November 5, 2020, re: Application'],
    ['*Delegation from Catherine Truong, Director of Development, RioCan Management, re: Application', '*Delegation from a Director of Development, RioCan Management, re: Application'],
    ['The following persons spoke: Miroslaw Surkont, Resident, spoke regarding traffic', 'The following persons spoke: Resident, spoke regarding traffic'],
    ['David Sajecki and Michi McCloskey, Sajecki Planning provided an overview.', 'Sajecki Planning provided an overview.'],
    ['Item 6.4 - Presentation by Anna Wynveen.pdf', 'Item 6.4 - Presentation.pdf'],
    ['Owner: John Smith File: OZ 19/016 W4', 'Owner: an individual File: OZ 19/016 W4'],
    ['Members present: Mayor Crombie, Councillor S. Dasko, Councillor K. Ras', 'Members present: Mayor, Councillor, Councillor'],
    ['3. Teresa Ward, Brampton Resident, dated November 29, 2021', '3. Brampton Resident, dated November 29, 2021'],
    ['Proposed Draft Plan of Subdivision - Candevcon Limited- Navjot Brar - File OZS-2020-0017', 'Proposed Draft Plan of Subdivision - Candevcon Limited- an individual - File OZS-2020-0017'],
  ];
  for (const [a, b] of cases) assert.equal(P.scrubPeople(a), b, a);
  const keep = [
    'Owner: Hanseatic Holdings Limited c/o Park Property Management File: OZ 19/016 W4',
    'Correspondence from Davies Howe LLP, dated July 4, 2022',
    'Correspondence from Credit Valley Residents Association, dated July 14, 2022, re. City File',
    'Application to Amend the Official Plan – Glen Schnarr & Associates Inc. – 2034 Queen Street West – Ward 6',
    'Registered Plan 43M-1765 – East of Airport Road, South of Ward 10, Planning References – C07E17.011',
    'Planning and Development Committee Report 6 - 2020 dated June 22, 2020',
  ];
  for (const s of keep) assert.equal(P.scrubPeople(s), s, s);
});

test('a document named after its writer reads "Correspondence", with its date and file', () => {
  const d = P.scrubCouncil({ meetings: { m: { items: [{ title: '', text: '', docs: [['1', 'Parin Patel, August 21, 2021 - OZS-2021-0025.pdf'], ['2', 'Hitendra Rathod.pdf'], ['3', 'Recommendation Report - Appendix 2.pdf']] }] } } });
  assert.deepEqual(d.meetings.m.items[0].docs.map(x => x[1]), ['Correspondence, August 21, 2021 - OZS-2021-0025.pdf', 'Correspondence.pdf', 'Recommendation Report - Appendix 2.pdf']);
});

test('the stored council data names no one, and the build keeps it so', () => {
  const c = JSON.parse(src('data/council.json'));
  const left = [];
  for (const m of Object.values(c.meetings)) for (const it of m.items) for (const s of [it.title, it.text, ...(it.docs || []).map(d => d[1])]) if (P.hasPeople(s)) left.push(s);
  assert.equal(left.length, 0, left.slice(0, 3).join('\n'));
  assert.doesNotMatch(src('data/council.json'), /Aferdita|Dzaferovska|Kovac|Wynveen|Rathod/);
  assert.match(src('scripts/build-council.js'), /require\('\.\.\/js\/privacy\.js'\)\.scrubCouncil\(out\);\n {2}fs\.writeFileSync\(path\.join\(OUT, 'council\.json'\)/);
});
