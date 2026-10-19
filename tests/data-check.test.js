'use strict';
// The weekly refresh's review gate (scripts/data-check.js, .github/workflows/site.yml).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../scripts/data-check.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const week = (o = {}) => ({ generatedAt: '2026-10-12T10:00:00Z', records: { 'Brampton – building permits': 23924, 'Caledon – building permits': 7525 }, kinds: { application: 7043, permit: 46194 }, devs: 23590,
  units: { existing: 20965, built: 35859, committed: 51425, proposed: 155747, anticipated: 21806 }, infill: 11803, ...o });

test('a measure moves more than usual past 10% and its floor; small moves never hold', () => {
  const now = week({ generatedAt: '2026-10-19T10:00:00Z', records: { 'Brampton – building permits': 56226, 'Caledon – building permits': 7554 }, kinds: { application: 7046, permit: 78095 }, devs: 23683 });
  const rows = C.compare(week(), now);
  const f = l => rows.find(r => r.label === l);
  assert.equal(f('Brampton – building permits: records').flagged, true);
  assert.equal(f('All permits').flagged, true);
  assert.equal(f('Caledon – building permits: records').flagged, false);
  assert.equal(f('Developments').flagged, false);
  // 50% of a small number is under the floor.
  const tiny = C.compare(week({ records: { 'Small – layer': 40 } }), week({ records: { 'Small – layer': 80 } }));
  assert.equal(tiny.find(r => r.label === 'Small – layer: records').flagged, false);
  const v = C.verdict(rows);
  assert.equal(v.held, true);
  assert.deepEqual(v.reasons, ['Brampton – building permits: records +135% in a week', 'All permits +69% in a week']);
});

test('the verdict: failing tests always hold; accept publishes a big move; site checks are listed', () => {
  const rows = C.compare(week(), week({ devs: 48186 }));
  assert.equal(C.verdict(rows).held, true);
  assert.equal(C.verdict(rows, { accept: true }).held, false, 'a person looked');
  assert.equal(C.verdict(rows, { accept: true }).accepted, true);
  assert.equal(C.verdict(C.compare(week(), week()), { testsFailed: 2, accept: true }).held, true, 'tests still hold it');
  assert.deepEqual(C.verdict(C.compare(week(), week()), { testsFailed: 1 }).reasons, ['1 test failed']);
  assert.equal(C.verdict(C.compare(week(), week())).held, false);
  const v = C.verdict(rows, { siteChecks: [{ test: 'Embleton', message: '299 !== 343' }] });
  const md = C.markdown(rows, v, { prevAt: '2026-10-12', nowAt: '2026-10-19', testLog: 'ok 1 - a\nnot ok 2 - Bovaird badge\n' });
  assert.match(md, /\*\*held for review\*\*/);
  assert.match(md, /\| \*\*Developments\*\* \| 23,590 \| 48,186 \| \+24,596 \(\+104%\) \|/);
  assert.match(md, /- Embleton: 299 !== 343/);
  assert.match(md, /- Bovaird badge/);
  assert.match(md, /tick \*\*accept_data\*\*/);
  assert.match(md, /General screening results only/);
});

test('data/refresh.json for the app: held with the date shown and the issue; ok with this week', () => {
  const held = C.refreshJSON({ held: true, reasons: ['All permits +69% in a week'], prevAt: '2026-10-12T10:00:00Z', nowAt: '2026-10-19T10:00:00Z' }, 'https://github.com/o/r/issues/7', '2026-10-19');
  assert.deepEqual(held, { version: 1, status: 'held', checked: '2026-10-19', shown: '2026-10-12', reasons: ['All permits +69% in a week'], issue: 'https://github.com/o/r/issues/7' });
  assert.deepEqual(C.refreshJSON({ held: false, reasons: [], prevAt: '2026-10-12', nowAt: '2026-10-19' }, null, '2026-10-19'), { version: 1, status: 'ok', checked: '2026-10-19', shown: '2026-10-19', reasons: [] });
});

test('site.yml: the gate before the commit; held keeps last week, opens or comments on one issue; deploy goes on', () => {
  const y = src('.github/workflows/site.yml');
  assert.match(y, /accept_data:\n\s+description: .*\n\s+type: boolean\n\s+default: false/);
  assert.match(y, /issues: write/);
  const gate = y.indexOf("- name: Check this week's data"), hold = y.indexOf("- name: Hold this week's data for review"), commit = y.indexOf('- name: Commit if changed');
  assert.ok(gate > 0 && gate < hold && hold < commit, 'gate, then hold, then commit');
  assert.match(y, /node scripts\/data-check\.js --prev \/tmp\/prev --data data --site-report "\$SITE_CHECKS_REPORT" --tests-failed "\$\{failed:-0\}"/);
  assert.match(y, /if: steps\.check\.outputs\.held == 'true'\n[\s\S]{0,120}git checkout -- data\//);
  assert.match(y, /gh issue list --label data-held --state open/);
  assert.match(y, /- name: Commit if changed\n\s+if: steps\.check\.outputs\.held != 'true'/);
  assert.match(y, /git add data\/snapshot\.json .* data\/refresh\.json\n/);
  assert.match(y, /deploy:\n[\s\S]*- name: Unit tests\n\s+env:\n\s+SITE_CHECKS: warn/);
  // A step that runs the tests never fails on a week that passes (bash -e).
  assert.match(y, /if npm test > \/tmp\/test\.log 2>&1; then failed=0; else /);
});
