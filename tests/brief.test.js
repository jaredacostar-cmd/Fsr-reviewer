'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/brief.js');

const MINUTES = 'Application to remove the "H" holding provision to permit 148 stacked townhomes. File: H-OZ 19/004 W7 '
  + 'Jasdeep Heer, Resident expressed concerns regarding the location of the proposed development, traffic, and fencing. '
  + 'RECOMMENDATION PDC-0007-2022 Moved By Councillor D. Damerla That the report dated December 23, 2021, from the Commissioner of Planning and Building recommending approval '
  + 'of the removal of the "H" holding provision be adopted, subject to the Region of Peel servicing allocation. YES (9) Councillor A ABSENT (3) Mayor Carried (9 to 0)';

test('council item brief: verdict, shortened motion, vote, requirements and concerns', () => {
  const s = B.summarizeItem({ title: 'REMOVAL OF THE "H" HOLDING PROVISION REPORT (WARD 7)', text: MINUTES, outcome: 'CARRIED', docs: [] }, true);
  assert.equal(s.verdict, 'Approval endorsed');
  assert.equal(s.vote, 'Carried 9–0');
  assert.match(s.decision, /^That the staff report recommending approval/);
  assert.doesNotMatch(s.decision, /YES|Moved By/);
  const req = s.requirements.map(r => r.label);
  assert.ok(req.includes('Holding provision (H)'));
  assert.ok(req.includes('Servicing / allocation'));
  assert.ok(req.includes('Region of Peel comments'));
  assert.ok(s.requirements.find(r => r.label === 'Servicing / allocation').infra);
  assert.deepEqual(s.concerns, ['Traffic / roads']);
});

test('item kinds and verdicts from titles and outcomes', () => {
  assert.equal(B.itemKind({ title: 'Correspondence re: Application to Amend the Zoning By-law', docs: [] }), 'Correspondence');
  assert.equal(B.itemKind({ title: 'PUBLIC MEETING INFORMATION REPORT (WARD 5)', docs: [] }), 'Public meeting');
  assert.equal(B.itemKind({ title: 'A by-law to amend Zoning By-law 0225-2007', docs: [] }), 'By-law');
  assert.equal(B.verdictOf({ title: 'x', text: 'That the report be referred back to staff.', outcome: 'REFERRED' }, true), 'Referred back');
  assert.equal(B.verdictOf({ title: 'Staff Report', text: 'See By-law 221-2020' }, true), 'By-law 221-2020 passed');
  const s37 = B.summarizeItem({ title: 'SECTION 37 COMMUNITY BENEFITS REPORT', text: 'That the sum of $1,346,000.00 be approved as the Section 37 contribution.', docs: [] }, true);
  assert.ok(s37.requirements.some(r => r.label === 'Section 37 / community benefits $1,346,000'));
});

test('across items: counts concerns, keeps one requirement per kind; latest decisive item first', () => {
  const a = { s: { decision: '', verdict: 'Public meeting held', concerns: ['Traffic / roads', 'Parking'], requirements: [{ label: 'Stormwater management', infra: true }] } };
  const b = { s: { decision: 'That …', verdict: 'Approval endorsed', concerns: ['Traffic / roads'], requirements: [{ label: 'Stormwater management', infra: true }] } };
  const all = B.across([a, b]);
  assert.deepEqual(all.concerns.find(c => c.label === 'Traffic / roads').n, 2);
  assert.equal(all.requirements.length, 1);
  assert.equal(B.latestDecisive([a, b]), b);
  assert.equal(B.latestDecisive([]), null);
});
