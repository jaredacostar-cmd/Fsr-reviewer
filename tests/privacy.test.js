'use strict';
// No one's name, contact, contractor or internal note from any source (js/privacy.js). Every case
// here is synthetic (Jane Doe, Doe Consulting, 555 numbers): the tests never hold a real person.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/privacy.js');

test('council text: names go, roles stay', () => {
  const cases = [
    ['Moved By Councillor J. Doe Seconded By Councillor M. Roe That Recommendations PDC-0019-2024', 'Moved By Councillor Seconded By Councillor That Recommendations PDC-0019-2024'],
    ['Staff Report by Jane Doe, Strategic Leader, Project Management', 'Staff Report by Strategic Leader, Project Management'],
    ['Correspondence from Janet Roe, Brampton resident, dated November 5, 2020, re: Application', 'Correspondence from a Brampton resident, dated November 5, 2020, re: Application'],
    ['*Delegation from Jane Doe, Director of Development, Example Management, re: Application', '*Delegation from a Director of Development, Example Management, re: Application'],
    ['The following persons spoke: John Roe, Resident, spoke regarding traffic', 'The following persons spoke: Resident, spoke regarding traffic'],
    ['Jane Doe and Mary Roe, Doe Planning provided an overview.', 'Doe Planning provided an overview.'],
    ['Item 6.4 - Presentation by Jane Doe.pdf', 'Item 6.4 - Presentation.pdf'],
    ['Members present: Mayor Doe, Councillor S. Roe, Councillor K. Poe', 'Members present: Mayor, Councillor, Councillor'],
    ['Letter from the Minister Doe regarding housing', 'Letter from the Minister regarding housing'],
    ['3. Jane Ward, Brampton Resident, dated November 29, 2021', '3. Brampton Resident, dated November 29, 2021'],
    ['Proposed Draft Plan of Subdivision - Example Engineering Limited- Jane Roe - File OZS-2020-0017', 'Proposed Draft Plan of Subdivision - Example Engineering Limited- an individual - File OZS-2020-0017'],
    // A person before the firm they speak for; a nickname in brackets; a hyphenated surname.
    ['Jane Doe, Doe Consulting Ltd. and Development Planner responded to questions.', 'Doe Consulting Ltd. and Development Planner responded to questions.'],
    ['Xiao (Jane) Doe, Development Planner, provided an overview', 'Development Planner, provided an overview'],
    ['Jennifer Doe‑Roe, Planner, provided an overview', 'Planner, provided an overview'],
    ['Delegation - Jane Doe re: Item 5.1', 'Delegation re: Item 5.1'],
    ['A By-law to authorize the execution of a Development Agreement between Jane Doe and John Doe and The Corporation of the City of Mississauga', 'A By-law to authorize the execution of a Development Agreement between the owner and The Corporation of the City of Mississauga'],
    // The backstop: a common given name and a surname, anywhere.
    ['Jennifer Doe regarding agenda item 10.2', 'an individual regarding agenda item 10.2'],
  ];
  for (const [a, b] of cases) assert.equal(P.scrubPeople(a), b, a);
  const keep = [
    'Correspondence from Example Howe LLP, dated July 4, 2022',
    'Correspondence from Example Valley Residents Association, dated July 14, 2022, re. City File',
    'Application to amend the Official Plan, Example Canada Inc. – Infrastructure Ontario, Ward 3',
    'Registered Plan 43M-1765 – East of Airport Road, South of Ward 10, Planning References – C07E17.011',
    'Planning and Development Committee Report 6 - 2020 dated June 22, 2020',
    'That the applications under File OZ 25-15 W8, 3650 Example Avenue West, be received',
    'Rezoning to permit 12 homes at 7060 Glen Erin Drive and Mark Street',
  ];
  for (const s of keep) assert.equal(P.scrubPeople(s), s, s);
});

test('a named owner, applicant or agent reads as the role; a c/o party goes', () => {
  const cases = [
    ['Owner: John Smith File: OZ 19/016 W4', 'Owner: the owner File: OZ 19/016 W4'],
    ['Owner: Example Holdings Limited c/o Sample Property Management File: OZ 19/016 W4', 'Owner: the owner File: OZ 19/016 W4'],
    ['Applicant: 1234567 Ontario Inc. File: OZ 21-19 W2 Example Planning provided an overview', 'Applicant: the applicant File: OZ 21-19 W2 Example Planning provided an overview'],
    ['Owners: Doe Developments Ltd., and Roe Corporation File: OZ/OPA 22-19 W7', 'Owners: the owners File: OZ/OPA 22-19 W7'],
    ['Owner: Doe Developments Limited (Doe Homes) Files: OZ 19/012 W10', 'Owner: the owner Files: OZ 19/012 W10'],
    ['Owner: Doe Developments Inc. - 10709 Example Road - Ward 6', 'Owner: the owner - 10709 Example Road - Ward 6'],
    ['Application to Amend the Zoning By-law, Doe Developments c/o Roe Consulting, 137 Example Avenue West, Ward 4, File: OZS-2023-0018', 'Application to Amend the Zoning By-law, Doe Developments, 137 Example Avenue West, Ward 4, File: OZS-2023-0018'],
    ['Application, Doe Inc. (c/o Roe Developers Inc.) – 8680 Example Road – Ward 4', 'Application, Doe Inc. – 8680 Example Road – Ward 4'],
    ['Staff report, Doe Inc. c/o Jane Roe, 223 Main Street South, Ward 3', 'Staff report, Doe Inc., 223 Main Street South, Ward 3'],
    ['That the applications under File OZ 25-15 W8, Jane Doe, 3650 Example Avenue West, to change the zoning', 'That the applications under File OZ 25-15 W8, the owner, 3650 Example Avenue West, to change the zoning'],
  ];
  for (const [a, b] of cases) assert.equal(P.scrubPeople(a), b, a);
  // Scrubbed text stays as it is (the stored data is scrubbed once more on every build).
  for (const [, b] of cases) assert.equal(P.scrubPeople(b), b, b);
});

test('a council document keeps only planning-document words, numbers, dates and file references', () => {
  const cases = [
    ['Jane Doe, August 21, 2021 - OZS-2021-0025.pdf', 'Correspondence, August 21, 2021 - OZS-2021-0025.pdf'],
    ['John Roe.pdf', 'Correspondence.pdf'],
    ['11.2-1 - Jane Doe.pdf', 'Correspondence - 11.2-1.pdf'],
    ['Appendix 3 - Jane Doe.pdf', 'Appendix 3.pdf'],
    ['Correspondence - Jane Ward.pdf', 'Correspondence.pdf'],
    ['6.2 - Jane Doe, Example Consulting - Presentation.pdf', '6.2 - Presentation.pdf'],
    ['Item 6.1. - Applicant Presentation Jane Doe-Roe.pdf', 'Item 6.1. - Applicant Presentation.pdf'],
    ['Jane Doe, Doe Consulting.pdf', 'Correspondence.pdf'],
    ['By-law - 1234567 Ontario Inc. 43M-1954.pdf', 'By-law - 43M-1954.pdf'],
    ['OZS-2020-0034 Example Development Inc.- Draft Zoning By-law Amendment.pdf', 'OZS-2020-0034 - Draft Zoning By-law Amendment.pdf'],
    ['Correspondence - Jane Doe, on behalf of Example Properties Inc. dated June 17, 2024.pdf', 'Correspondence - dated June 17, 2024.pdf'],
    ['Delegation - Max and Amity 5.4_Redacted.pdf', 'Delegation - 5.4_Redacted.pdf'],
    ['OZ 18-015 W7 - 0182-2021.pdf', 'Correspondence - OZ 18-015 W7 - 0182-2021.pdf'],
  ];
  for (const [a, b] of cases) assert.equal(P.docName(a), b, a);
  const keep = ['Recommendation Report - Appendix 2.pdf', 'OZS_2020_0012_APP3_OP.pdf', 'Schedule A to By-law 2025-108.pdf',
    'Item 6.2 - Staff Presentation - 86 Example Street - OZ 20-011 (Ward 11).pdf', 'C01W03.001 - Recommendation Report - 11570 Example Drive.pdf',
    'Attachment 1 – Draft Plan of Subdivision(2).pdf', 'Correspondence - Brampton Resident, dated October 22, 2023.pdf', 'SPA-2024-0144 Notice.pdf'];
  for (const s of keep) assert.equal(P.docName(s), s, s);
  for (const [, b] of cases) assert.equal(P.docName(b), b, b);
  const d = P.scrubCouncil({ meetings: { m: { items: [{ title: 'Delegation from Jane Doe, re: Item 5.1', text: '', docs: [['1', 'Jane Doe.pdf']] }] } } });
  assert.deepEqual(d.meetings.m.items[0], { title: 'Delegation re: Item 5.1', text: '', docs: [['1', 'Correspondence.pdf']] });
});

test('descriptions: no e-mail, phone, named person, builder, consultant or staff note; the homes stay', () => {
  const cases = [
    ['Change of Scope — Revision Permit - Changed to three unit dwelling Owner email: jane.doe@example.com', 'Change of Scope — Revision Permit - Changed to three unit dwelling'],
    ['Alteration/Renovation — Alter Detached (Basement Apartment) jane@example.com - contractor email', 'Alteration/Renovation — Alter Detached (Basement Apartment)'],
    ['Business (Temporary Sales Office - Example Homes) Call for inspections - Jane Doe Site Super - 555-555-0100', 'Business (Temporary Sales Office - Example Homes)'],
    ['Site Plan Full — Proposal by Mr. John Doe, Example Homes Ltd. is the owner of the land.', 'Site Plan Full — Proposal by, Example Homes Ltd. is the owner of the land.'],
    ['New — Erect Single Refund of $1,000 given to Jane Doe Aug 29/02', 'New — Erect Single'],
    ['New — Erect Single (per Jane Doe July 23/01 - Letter from Owner/Applicant in file)', 'New — Erect Single'],
    ['Limited Site Plan — Addition (this was approved in a previous submission as per Jane Doe). Will require minor changes', 'Limited Site Plan — Addition. Will require minor changes'],
    ['New — Model: AB-36-3 (2024 OBC)- Elevation C **Application Cancelled per applicant\'s request. See attached Email**', 'New — Model: AB-36-3 (2024 OBC)- Elevation C'],
    ['"CANCELLATION REQUEST SENT TO INSPECTION" RESIDENTIAL SECOND UNIT IN BASEMENT', 'RESIDENTIAL SECOND UNIT IN BASEMENT'],
    ['New — Construct Single - Doe Homes Model: Hayley, Elevation C', 'New — Construct Single - Model: Hayley, Elevation C', { kind: 'permit', type: 'New' }],
    ['Full Site Plan — The enclosed Site Plan prepared by Doe Architects contemplates five play areas.', 'Full Site Plan — The enclosed Site Plan prepared by the consultant contemplates five play areas.'],
    ['Pre-consultation on behalf of our client, Doe Holdings Inc., for 12 townhouses.', 'Pre-consultation on behalf of our client, for 12 townhouses.'],
    ['Doe Planning Inc. is pleased to submit this application for 40 units.', 'The consultant is pleased to submit this application for 40 units.'],
    ['Zoning By-law Amendment on behalf of Jane and John Doe (hereinafter the Does), for 3 lots.', 'Zoning By-law Amendment on behalf of the owner, for 3 lots.'],
    ['Limited Site Plan — I am writing on behalf of Doe Steel (2005) Inc. to propose a curb cut.', 'Limited Site Plan — I am writing on behalf of the owner to propose a curb cut.'],
    ['Draft Plan of Subdivision — Jane Doe & Associates Inc. (JDAI) has been retained by the owner for 40 lots.', 'Draft Plan of Subdivision — The consultant has been retained by the owner for 40 lots.'],
    ['New — Construct Industrial (Shell Building) Note to Associate: As per Chief Building Official, Jane Roe, construction is expected soon', 'New — Construct Industrial (Shell Building)'],
    ['Alteration — Alter Detached (Basement Apartment) Please collect payment before the next inspection as requested by Jane D. - John R 10.02.23', 'Alteration — Alter Detached (Basement Apartment)', { kind: 'permit', type: 'Alteration' }],
  ];
  for (const [a, b, rec] of cases) assert.equal(P.scrubDescription(a, rec), b, a);
  const keep = [
    'Repeat Housing — Model: AB-3607-ROSEWOOD (2024 OBC)- Elevation C (5 Bed), 5 BED **Note: Development Charges to be paid in full prior to Occupancy Inspection **',
    'New — Model: AB-01 (2024 OBC)- Elevation A **FIREBREAK LOT**',
    'CONDITIONAL PERMIT - NEW (2) STOREY APT BLDG - COMPLIANCE DATE: DECEMBER 5 2022',
    'Full Site Plan — 200 residential units, 1.5 parking spaces per unit, 39 units per hectare.',
    'Basic Site Plan — On behalf of the Example District School Board, we are applying for a portable.',
    'The shelter is operated on behalf of the Region of Peel.',
    'New — Construct Town House - Model: 36-1 Bruce End, Elevation B',
  ];
  for (const s of keep) assert.equal(P.scrubDescription(s), s, s);
  for (const [, b, rec] of cases) assert.equal(P.scrubDescription(b, rec), b, b);
});

test('raw source fields: people, contacts and notes never listed', () => {
  const p = { OBJECTID: 7, FOLDERRSN: 1, PERMITNUMBER: 'B1', WORKDESC: 'New house', BUILDER: 'Doe Homes', CONTRACTOR: 'Doe Ltd', OWNER_NAME: 'Jane Doe', APPLICANT: 'x', AGENT: 'x', PLANNER: 'Jane Doe', CONTACT_PHONE: '555-555-0100', EMAIL: 'j@example.com', NOTES: 'called owner', COMMENTS: 'x', ARCHITECT: 'x', CONSULTANT: 'x', STREET_NAME: 'Main St', ISSUEDATE: 1600000000000 };
  assert.deepEqual(Object.keys(P.safeProps(p, ['WORKDESC'])), ['OBJECTID', 'FOLDERRSN', 'PERMITNUMBER', 'STREET_NAME', 'ISSUEDATE']);
  for (const k of ['BUILDER', 'CONTRACTOR', 'OWNER', 'Applicant_Name', 'agent', 'CONTACT', 'Architect', 'CONSULTANT', 'ENGINEER', 'PLANNER', 'PHONE', 'E_MAIL', 'Email', 'FAX', 'NOTE', 'COMMENTS', 'REMARKS', 'NAME']) assert.ok(P.privateKey(k), k);
  for (const k of ['OBJECTID', 'ADDRESS', 'STATUS', 'ISSUEDATE', 'STREET_NAME', 'DWELLINGS', 'WARD']) assert.ok(!P.privateKey(k), k);
});

test('EA contact lists and the consultant in a servicing report title', () => {
  for (const l of ['Appendix B: Study contact list', 'Appendix K - Contact List and Project Notifications', 'Appendix A2 – Stakeholder Contact List', 'Agency Contact List', 'A – Notification Materials and Contact Lists', 'Mailing list']) assert.ok(P.isContactList(l), l);
  for (const l of ['Appendix A: Short list alignment alternatives', 'Appendix M - Shortlist Evaluation', 'Appendix E – Public and Stakeholder Comments']) assert.ok(!P.isContactList(l), l);
  assert.equal(P.fsrTitle('Functional Servicing Report, prepared by Doe Engineering, dated May 2026'), 'Functional Servicing Report, dated May 2026');
  assert.equal(P.fsrTitle('Site Servicing Report prepared by Doe Designs Inc., dated September 25, 2022;'), 'Site Servicing Report, dated September 25, 2022');
  assert.equal(P.fsrTitle('DOE Engineering Letter re: Functional Servicing Report'), 'Engineering Letter re: Functional Servicing Report');
  assert.equal(P.fsrTitle('Functional Servicing Report'), 'Functional Servicing Report');
});
