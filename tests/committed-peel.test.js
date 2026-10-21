'use strict';
// Phase 1A of the pipeline ledger (docs/pipeline-ledger-plan.md, D1): committed under the Peel rule
// (a building permit or a site servicing permit), next to MECP D-5-1, which stays as a named option.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../js/demand.js');

const day = s => new Date(`${s}T00:00:00Z`);
// A building permit: the units it states (0: none stated), issued on a date.
const bp = (ref, units, date = '2024-03-01', extra = {}) => ({ kind: 'permit', ref, units, type: 'Residential', description: units ? `New apartment building, ${units} units` : 'New stacked townhouse dwelling', phase: 'permit', events: [{ phase: 'permit', date: day(date) }], ...extra });
const app = (ref, units) => ({ kind: 'application', ref, units, phase: 'approved', description: 'Site plan', events: [{ phase: 'approved', date: day('2023-01-01') }] });
const dev = (phase, units, permits = [], buildout = null) => ({
  key: `Brampton|${phase}-${units}-${permits.length}`, title: 'Site', municipality: 'Brampton', phase, units, records: [app('SP 1', units), ...permits],
  buildout: buildout || { planned: units, permitted: permits.reduce((t, r) => t + (r.units || 0), 0), completed: 0, unbuilt: units, remaining: units },
});
const counted = { bucket: 'counted', servicingApplied: '2024-01-10', evidence: [{ kind: 'site', ref: 'DRAIN 1', issued: '2024-02-01', services: ['water'] }] };

test('only a site servicing permit: committed, the whole development', () => {
  const p = dev('approved', 300);
  assert.equal(D.isCommittedPeel(p, counted), true);
  const c = D.committedPeelUnits(p, counted);
  assert.equal(c.units, 300); assert.equal(c.by, 'servicing'); assert.equal(c.estimated, false);
});

test('only a building permit: committed, but only the units it covers', () => {
  const p = dev('permit', 300, [bp('BP 24-100', 120)]);
  assert.equal(D.isCommittedPeel(p, { bucket: 'permitNoSvc' }), true);
  const c = D.committedPeelUnits(p, { bucket: 'permitNoSvc' });
  assert.equal(c.units, 120, 'the permit covers 120 of 300'); assert.equal(c.by, 'permits');
  assert.equal(c.left, 300);
  // (built units are not committed: they are on the system)
  const built = dev('construction', 300, [bp('BP 24-100', 120)], { planned: 300, permitted: 120, completed: 50, unbuilt: 250, remaining: 180 });
  assert.equal(D.committedPeelUnits(built, null).units, 70);
});

test('both permits: the servicing permit commits the whole development', () => {
  const p = dev('permit', 300, [bp('BP 24-100', 120)]);
  const c = D.committedPeelUnits(p, counted);
  assert.equal(c.units, 300); assert.equal(c.by, 'servicing'); assert.equal(c.permits, 1);
});

test('neither: approved under D-5-1, not committed under the Peel rule', () => {
  const p = dev('approved', 300);
  assert.equal(D.isCommitted(p), true, 'D-5-1: site plan approved');
  assert.equal(D.isCommittedPeel(p, { bucket: 'none' }), false);
  assert.equal(D.isCommittedPeel(p, null), false);
  assert.equal(D.committedPeelUnits(p, null).units, 0);
});

test('septic only: privately serviced, never committed (not even with a building permit)', () => {
  const p = dev('permit', 2, [bp('BP 24-7', 1)]);
  const septic = { bucket: 'private', evidence: [{ kind: 'septic' }] };
  assert.equal(D.isCommittedPeel(p, septic), false);
  assert.equal(D.committedPeelUnits(p, septic).units, 0);
  // Servicing permits for an existing building only do not count; a building permit still does.
  assert.equal(D.isCommittedPeel(dev('approved', 40), { bucket: 'existingOnly' }), false);
  assert.equal(D.isCommittedPeel(p, { bucket: 'existingOnly' }), true);
});

test('a permit stating no units: the development split evenly across its permits, flagged', () => {
  // Two buildings: one states 100 units, one states none; 300 planned → the blank one takes 300 / 2.
  const p = dev('permit', 300, [bp('BP 24-100', 100), bp('BP 24-200', 0)]);
  const c = D.committedPeelUnits(p, null);
  assert.equal(c.units, 250); assert.equal(c.estimated, true); assert.equal(c.blank, 1); assert.equal(c.permits, 2);
  // Never more than is left to build.
  const q = dev('permit', 100, [bp('BP 24-300', 0), bp('BP 24-400', 0)]);
  assert.equal(D.committedPeelUnits(q, null).units, 100);
});

test('cancelled and withdrawn permits do not commit; a withdrawn development never is', () => {
  const p = dev('approved', 300, [bp('BP 24-100', 120, '2024-03-01', { phase: 'cancelled' })]);
  assert.equal(D.isCommittedPeel(p, null), false);
  assert.equal(D.isCommittedPeel({ ...dev('cancelled', 10), phase: 'cancelled' }, counted), false);
});

test('D-5-1 stays a named option; the layer bar still uses it', () => {
  assert.equal(D.COMMIT_RULES.d51, 'MECP D-5-1');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'layers.js'), 'utf8'), /approved: 'committed', permit: 'committed', construction: 'committed'/);
});
