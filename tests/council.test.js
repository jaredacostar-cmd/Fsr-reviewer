'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../scripts/council-parse.js');

const item = (n, title, docs, body) => `<DIV class='AgendaItemContainer indent' style="width:auto" ><DIV class='AgendaItem AgendaItem1' ><DIV class='AgendaItemTitleRow' ><H3 Id='x' ><DIV class='AgendaItemCounter' style="display:inline-block;" >${n}</DIV><DIV class='AgendaItemNavigate indent' ><DIV class='AgendaItemTitle' style="width:auto;" ><a tabindex='0' href="javascript:SelectItem(1);" >${title}</a></DIV></DIV></H3>${docs.map(([id, name]) => `<DIV class='AgendaItemAttachment AgendaItemAttachment1' ><a class='Link' href="filestream.ashx?DocumentId=${id}" target='_blank' ><SPAN class='Link' >${name}</SPAN></a></DIV>`).join('')}<DIV class='Body'><p>${body}</p></DIV></DIV></DIV>`;

test('agenda items: title, attachments, minutes text, outcome and file numbers', () => {
  const html = `<html>${item('6.1', 'PUBLIC MEETING RECOMMENDATION REPORT (WARD 2)', [['90115', 'Recommendation Report, OZ OPA 25-8 W2 - 0427-2026.pdf']], 'Concerns about stormwater were raised. RECOMMENDATION PDC-0050-2026 … Carried (11 to 0)')}${item('18.21', 'By-law 178-2026 - To amend Zoning By-law (File: OZS-2026-0016)', [['175048', 'Map A.pdf']], 'See Item 12.1')}${item('3.', 'Minutes of the previous meeting', [], 'Received')}<DIV>No Item Selected</DIV></html>`;
  const items = C.parseItems(html);
  assert.equal(items.length, 3);
  assert.equal(items[0].title, 'PUBLIC MEETING RECOMMENDATION REPORT (WARD 2)');
  assert.equal(items[0].docs[0].id, '90115');
  assert.equal(items[0].outcome, 'CARRIED');
  assert.match(items[0].body, /stormwater/);
  assert.deepEqual(C.itemFiles(items[0]), ['OZ OPA 25-8 W2']);
  assert.deepEqual(C.itemFiles(items[1]), ['OZS-2026-0016']);
  assert.deepEqual(C.itemFiles(items[2]), []);
});

test('file keys match the records: Mississauga OZ/OPA variants, Caledon bare numbers, subdivision letters', () => {
  assert.ok(C.fileKeys('OZ OPA 25-8 W2', 'Mississauga').includes('OZ|OPA|25|8'));
  assert.ok(C.fileKeys('OZOPA 26-07 W2', 'Mississauga').includes('OZ|26|7'));
  assert.ok(C.fileKeys('RZ 2026-0016', 'Caledon').includes('2026|16'));
  assert.ok(C.fileKeys('21T-21002C', 'Caledon').includes('21T|21002'));
  assert.ok(C.fileKeys('OZS-2025-0044', 'Brampton').includes('OZS|2025|44'));
});
