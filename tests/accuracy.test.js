'use strict';
/* Accuracy report (js/accuracy.js): match-rate computation over data/history.json.
 * Pure and Node-requireable; synthetic fixtures only — no historical data invented.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/accuracy.js');

// Synthetic history.json-shaped fixture. Entries: [date, phase] or [date, phase, 'rules'].
const H = {
  projects: {
    // Two forward transitions: both match.
    'Mississauga|A': [['2026-10-08', 'review'], ['2026-10-09', 'approved'], ['2026-10-12', 'completed']],
    // Backward transition on new file evidence: contradicts the earlier reading.
    'Mississauga|B': [['2026-10-08', 'permit'], ['2026-10-09', 'review']],
    // Rule-change re-reads: reported separately, never in the headline rate.
    'Brampton|C': [['2026-10-08', 'approved'], ['2026-10-12', 'review', 'rules']],
    'Brampton|D': [['2026-10-08', 'review'], ['2026-10-12', 'permit', 'rules']],
    // Withdrawn/refused can end any phase: matches.
    'Caledon|E': [['2026-10-08', 'construction'], ['2026-10-09', 'cancelled']],
    // Unknown phase: skipped, never judged.
    'Caledon|F': [['2026-10-08', 'bogus'], ['2026-10-09', 'review']],
    // Single event: no transition to judge.
    'Caledon|G': [['2026-10-08', 'review']],
  },
  runs: ['2026-10-08', '2026-10-09', '2026-10-12'],
  updated: '2026-10-12',
};

test('phaseAccuracy: forward moves and withdrawals match; backward moves contradict', () => {
  const s = A.phaseAccuracy(H);
  // Data transitions: A gives review->approved and approved->completed (2 matched);
  // B gives permit->review (1 contradicted); E gives construction->cancelled (1 matched).
  assert.equal(s.overall.matched, 3);
  assert.equal(s.overall.contradicted, 1);
  assert.equal(s.overall.total, 4);
  assert.equal(s.overall.rate, 0.75);
  assert.equal(s.judged, 4);
  assert.equal(s.skipped, 1);
});

test('phaseAccuracy: broken down by municipality, Mississauga first', () => {
  const s = A.phaseAccuracy(H);
  assert.deepEqual(Object.keys(s.byMuni), ['Mississauga', 'Caledon']);
  assert.deepEqual(s.byMuni.Mississauga, { matched: 2, contradicted: 1, total: 3, rate: 2 / 3 });
  assert.deepEqual(s.byMuni.Caledon, { matched: 1, contradicted: 0, total: 1, rate: 1 });
  // Brampton's only pairs are rule-change re-reads: absent from the headline breakdown.
  assert.ok(!('Brampton' in s.byMuni));
});

test('phaseAccuracy: rule-change re-reads are reported separately with their dates', () => {
  const s = A.phaseAccuracy(H);
  assert.equal(s.rules.total, 2);
  assert.equal(s.rules.forward, 1);
  assert.equal(s.rules.backward, 1);
  assert.deepEqual(s.rules.byMuni.Brampton, { forward: 1, backward: 1 });
  assert.deepEqual(s.rules.dates, ['2026-10-12']);
});

test('phaseAccuracy: counts projects with history and passes through metadata', () => {
  const s = A.phaseAccuracy(H);
  assert.equal(s.projectsWithHistory, 6); // every project except G
  assert.deepEqual(s.runs, ['2026-10-08', '2026-10-09', '2026-10-12']);
  assert.equal(s.updated, '2026-10-12');
});

test('phaseAccuracy: empty or missing history does not throw', () => {
  for (const h of [{}, { projects: {} }, null, undefined]) {
    const s = A.phaseAccuracy(h);
    assert.equal(s.overall.total, 0);
    assert.equal(s.overall.rate, null);
    assert.equal(s.rules.total, 0);
    assert.deepEqual(s.byMuni, {});
  }
});

test('phaseAccuracy: a project key without a municipality still counts', () => {
  const s = A.phaseAccuracy({ projects: { 'NoPipe': [['2026-10-08', 'review'], ['2026-10-09', 'approved']] } });
  assert.equal(s.overall.matched, 1);
  assert.ok(Object.keys(s.byMuni).length === 1);
});

test('aerialCoverage: counts developments the check can run for', () => {
  const c = A.aerialCoverage([
    { municipality: 'Mississauga', lat: 43.6 },
    { municipality: 'Brampton', lat: null },   // no mapped location
    { municipality: 'Caledon', lat: 43.8 },
    { municipality: 'Toronto', lat: 43.7 },    // no imagery configured
  ], ['Mississauga', 'Brampton', 'Caledon']);
  assert.deepEqual(c, { checkable: 2, total: 4 });
});

test('aerialCoverage: tolerates missing input', () => {
  assert.deepEqual(A.aerialCoverage(null, null), { checkable: 0, total: 0 });
  assert.deepEqual(A.aerialCoverage([], []), { checkable: 0, total: 0 });
});

test('AERIAL_RULE documents the check decision rule from js/aerial.js', () => {
  assert.equal(A.AERIAL_RULE.verdict, 'Likely completed');
  assert.equal(A.AERIAL_RULE.threshold, 0.7);
});
