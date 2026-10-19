'use strict';
// SPEC 1.3: the stalled clock uses every file event, permit and council item; a file under appeal is
// under appeal, never stalled; stalled / active / appeal split Proposed (phase 2, under review).
const test = require('node:test');
const { siteTest } = require('./helpers/site-check.js');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const H = require('./helpers/real-devs.js');

const Y = 365.25 * 864e5;
const proj = (extra = {}) => ({ phase: 'review', last: null, records: [], ...extra });
const app = (extra = {}) => ({ kind: 'application', phase: 'review', statusRaw: '', events: [], ...extra });

test('proposedStateOf: active · stalled · appeal, only for proposals under review', () => {
  const now = Date.UTC(2026, 9, 15);
  assert.equal(P.proposedStateOf(proj({ last: new Date(now - 3 * Y), records: [app()] }), now).state, 'stalled');
  assert.equal(P.proposedStateOf(proj({ last: new Date(now - 1 * Y), records: [app()] }), now).state, 'active');
  assert.equal(P.proposedStateOf(proj({ last: new Date(now - 4 * Y), records: [app({ statusRaw: 'OMB APPEAL' })] }), now).state, 'appeal');
  assert.equal(P.proposedStateOf(proj({ last: new Date(now - 3 * Y), records: [app({ council: { last: '2026-01-10' } })] }), now).state, 'active', 'a council item is activity');
  assert.equal(P.proposedStateOf(proj({ phase: 'approved', last: new Date(now - 5 * Y), records: [app()] }), now), null);
  assert.equal(P.proposedStateOf(proj({ phase: 'inception', last: new Date(now - 5 * Y), records: [app()] }), now), null);
});

siteTest('acceptance: 1580 and 1650 Dundas St E is under appeal, not stalled; its council item counts as activity', { skip: !H.available() && 'snapshot not present' }, () => {
  const p = H.realDevs().byKey.get('Mississauga|1580 AND 1650 DUNDAS ST E');
  assert.ok(p);
  const s = P.proposedStateOf(p);
  assert.equal(s.state, 'appeal');
  assert.ok(P.lastActivityOf(p) > +p.last, 'the 2023 committee item is later than the last file event (2022-09-21)');
});
