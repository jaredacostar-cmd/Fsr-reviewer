'use strict';
// Files that name another file by number (js/tree.js, step 4·): a revision under the file it revises,
// a replacement superseding the earlier file, a pre-consultation under its formal file; the main file
// of a tree is a full plan, never a minor one. And dormant developments (js/phases.js dormantOf).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const H = require('./helpers/real-devs.js');

test('10194 Heart Lake Rd: the full site plan is the main file, the limited one sits under it, the earlier application is history, 200 homes once', { skip: !H.available() }, () => {
  const { projects, tree } = H.realDevs();
  const p = projects.find(x => x.records.some(r => r.ref === 'SPA-2024-0144'));
  assert.ok(p.records.some(r => r.ref === 'SPA-2022-0101'), 'the application it replaces is in the same development');
  assert.equal(p.units, 200);
  const d = tree.devs.find(x => x.k === p.key), n = Object.fromEntries(d.n.map((x, i) => [x[0], { i, parent: x[2], rule: tree.codes.rules[x[3]] }]));
  assert.equal(d.n[0][0], 'SPA-2024-0144', 'the main file');
  assert.equal(n['SPA-2026-0045'].parent, n['SPA-2024-0144'].i, 'the limited site plan revises it');
  assert.equal(n['SPA-2022-0101'].rule, 'names the earlier application it replaces');
  assert.equal(n['SPA-2022-0101'].parent, -1, 'shown as an earlier file on the same land');
  assert.equal(projects.filter(x => x.records.some(r => r.ref === 'SPA-2022-0101' || r.ref === 'SPA-2024-0144')).length, 1, 'counted in one development, not two');
});

test('a reference never joins two towers: 225 Malta Ave (290) and 209 Steeles Ave W (449) stay apart', { skip: !H.available() }, () => {
  const { projects } = H.realDevs();
  const of = ref => projects.find(x => x.records.some(r => r.ref === ref));
  assert.notEqual(of('OZS-2020-0028'), of('OZS-2021-0032'));
  assert.equal(of('SPA-2026-0056'), of('SPA-2021-0230'), 'the limited plan sits with the plan it amends');
});

test('a reference to a file far away is ignored (SP18-041.000 "converted from PRE18.024" for its fee)', { skip: !H.available() }, () => {
  const { projects } = H.realDevs();
  const of = ref => projects.find(x => x.records.some(r => r.ref === ref));
  assert.notEqual(of('SP18-041.000'), of('PRE18.024'));
});

test('1-30 Gillingham Dr: a limited site plan for a patio is not the formal file of the 1,753-home pre-consultation', { skip: !H.available() }, () => {
  const { projects } = H.realDevs();
  const of = ref => projects.find(x => x.records.some(r => r.ref === ref));
  const pre = of('PRE-2019-0043'), patio = of('SPA-2022-0214');
  assert.notEqual(pre, patio, 'two developments');
  assert.equal(of('PRE-2021-0038'), pre, 'the follow-up redevelopment pre-consultation stays with it');
  assert.equal(pre.units, 1753);
  assert.equal(pre.phase, 'inception', 'still a pre-consultation, not under construction');
  assert.match(pre.description, /redevelopment/i);
  assert.ok(!(patio.units > 0), 'the patio adds no homes');
  // Even in one development, the patio plan and a shop's fit-out permit don't move the homes on.
  const recs = [pre.records, patio.records].flat().map(r => ({ ...r }));
  assert.equal(P.mergeProject('k', recs).phase, 'inception');
});

test('dormantOf: approved with no permit 3 years, in review 5, pre-application 3; never under appeal or with a building permit', () => {
  const now = Date.parse('2026-10-20T00:00:00Z'), at = y => new Date(Date.UTC(y, 0, 1));
  const dev = (phase, lastYear, extra = []) => ({ phase, last: at(lastYear), records: [{ kind: 'application', phase: 'approved', statusRaw: 'Approved' }, ...extra] });
  assert.ok(P.dormantOf(dev('approved', 2022), now), 'approved, nothing for 4 years');
  assert.equal(P.dormantOf(dev('approved', 2024), now), null);
  assert.equal(P.dormantOf(dev('review', 2022), now), null, 'in review gets 5 years');
  assert.ok(P.dormantOf(dev('review', 2020), now));
  assert.ok(P.dormantOf(dev('inception', 2022), now));
  assert.equal(P.dormantOf(dev('permit', 2015), now), null, 'a building permit stage is never dormant');
  assert.equal(P.dormantOf({ ...dev('review', 2015), records: [{ kind: 'application', phase: 'review', statusRaw: 'Appealed to OLT' }] }, now), null, 'under appeal');
  const council = dev('approved', 2020); council.records[0].council = { last: '2025-06-01' };
  assert.equal(P.dormantOf(council, now), null, 'a council item naming the file is activity');
  assert.equal(P.DORMANT_YEARS.approved, 3);
});
