'use strict';
// SPEC §2: the layer function (js/layers.js). Every development in exactly one layer; its units over
// the layers add up to the Overview's Peel totals; the acceptance developments land where the spec says.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/layers.js');
const D = require('../js/demand.js');
const G = require('../js/growth.js');
const H = require('./helpers/real-devs.js');
const skip = !H.available() && 'snapshot not present';

const at = (d, phase, label = phase) => ({ date: new Date(`${d}T00:00:00Z`), phase, label });
const permit = (o) => ({ kind: 'permit', ref: 'B1', uid: o.ref || 'B1', address: '1 MAIN ST', units: 10, phase: 'completed', props: {}, type: 'New dwelling', description: 'new dwelling', newBuild: true, ...o });

test('phase → layer (SPEC §2 table)', () => {
  assert.deepEqual(L.PHASE_LAYER, { inception: 'anticipated', review: 'proposed', approved: 'committed', permit: 'committed', construction: 'committed', completed: 'built', cancelled: null });
  assert.deepEqual(L.LAYERS, ['existing', 'built', 'committed', 'proposed', 'anticipated', 'to2051']);
});

test('a permit completed after census day is Built; before it, Existing', () => {
  const mk = d => ({ key: d, phase: 'completed', units: 10, records: [permit({ events: [at('2019-01-01', 'permit'), at(d, 'completed')] })], buildout: { planned: 10, permitted: 10, completed: 10, remaining: 0, unbuilt: 0 } });
  const after = L.ofDev(mk('2021-08-01')), before = L.ofDev(mk('2021-03-01'));
  assert.equal(after.layer, 'built'); assert.equal(after.parts.built, 10);
  assert.equal(before.layer, 'existing'); assert.equal(before.parts.existing, 10);
  // No published completion date: estimated from the issue date (12 months for houses).
  const est = L.ofDev({ key: 'e', phase: 'completed', units: 1, records: [permit({ units: 1, events: [at('2020-08-01', 'permit')] })], buildout: { planned: 1, permitted: 1, completed: 1, remaining: 0, unbuilt: 0 } });
  assert.equal(est.layer, 'built'); assert.ok(est.estimatedDates);
});

test('a development part-built: the built part is Built, the rest its own layer', () => {
  const p = { key: 'c', phase: 'construction', units: 100, records: [permit({ units: 40, events: [at('2022-01-01', 'permit'), at('2023-06-01', 'completed')] })], buildout: { planned: 100, permitted: 40, completed: 40, remaining: 60, unbuilt: 60 } };
  const x = L.ofDev(p);
  assert.equal(x.layer, 'committed');
  assert.deepEqual(x.parts, { existing: 0, built: 40, committed: 60, proposed: 0, anticipated: 0 });
  assert.equal(x.toPermit, 60);
});

test('withdrawn: no layer, no units', () => {
  const x = L.ofDev({ key: 'w', phase: 'cancelled', units: 50, records: [] });
  assert.equal(x.layer, null); assert.equal(x.units, 0);
});

test('to 2051: the target less the layers applied for', () => {
  assert.equal(L.toTarget(1000, { units: { built: 100, committed: 200, proposed: 300, anticipated: 50 } }), 350);
  assert.equal(L.toTarget(100, { units: { committed: 500 } }), 0, 'never negative');
  assert.equal(L.toTarget(null, { units: {} }), 0);
});

test('every development: exactly one layer; units over the layers == the development', { skip }, () => {
  const { projects } = H.realDevs();
  for (const p of projects) {
    const x = L.ofDev(p);
    if (p.phase === 'cancelled') { assert.equal(x.layer, null, p.key); continue; }
    assert.ok(L.LAYERS.includes(x.layer), `${p.key}: ${x.layer}`);
    const sum = Object.values(x.parts).reduce((t, v) => t + v, 0);
    assert.equal(sum, p.units > 0 ? p.units : 0, `${p.key}: parts ${sum} ≠ ${p.units}`);
    assert.equal(x.layer === 'committed', D.isCommitted(p), `${p.key}: committed layer == D.isCommitted`);
  }
});

test('the sum over layers == the Peel totals on the Overview', { skip }, () => {
  const { projects } = H.realDevs();
  const set = projects.filter(p => p.phase !== 'cancelled');
  const t = L.totals(set), pipe = G.pipelineTotals(set);
  const units = Object.values(t.units).reduce((a, v) => a + v, 0);
  assert.equal(units, pipe.planned, 'units planned');
  const people = Object.values(t.people).reduce((a, v) => a + v, 0), e = D.estimate(set, D.DEFAULT_CRITERIA, 'all');
  assert.ok(Math.abs(people - e.population) < 1, `people ${Math.round(people)} vs ${Math.round(e.population)}`);
});

test('Brampton|2055 BOVAIRD DR W → Proposed; Embleton & Heritage (C05W06.007) → Committed with 343 left', { skip }, () => {
  const { byKey, projects } = H.realDevs();
  assert.equal(L.ofDev(byKey.get('Brampton|2055 BOVAIRD DR W')).layer, 'proposed');
  const e = projects.find(p => (p.records || []).some(r => r.ref === 'C05W06.007'));
  assert.equal(e.units, 537);
  const x = L.ofDev(e);
  assert.equal(x.layer, 'committed');
  assert.equal(x.toPermit, 343, 'left to permit');
  assert.equal(x.parts.committed + x.parts.built + x.parts.existing, 537);
});

test('a file: its own layer and units (OZS-2025-0032: 592, Proposed)', { skip }, () => {
  const p = H.realDevs().byKey.get('Brampton|2055 BOVAIRD DR W');
  const r = p.records.find(x => x.ref === 'OZS-2025-0032');
  assert.deepEqual(L.ofFile(r, p), { layer: 'proposed', units: 592, confidence: 'stated' });
});

test('by dwelling type × layer: adds up to the layer totals', { skip }, () => {
  const { projects } = H.realDevs();
  const set = projects.filter(p => p.phase !== 'cancelled'), t = L.totals(set), bt = L.byType(set);
  for (const k of ['existing', 'built', 'committed', 'proposed', 'anticipated']) {
    const sum = Object.values(bt).reduce((a, r) => a + r[k], 0);
    assert.ok(Math.abs(sum - t.units[k]) < 1, `${k}: ${Math.round(sum)} vs ${t.units[k]}`);
  }
});

test('estimated units are tracked in their own layer', { skip }, () => {
  const { projects } = H.realDevs();
  const t = L.totals(projects.filter(p => p.phase !== 'cancelled'));
  const sum = Object.values(t.estimatedBy).reduce((a, v) => a + v, 0);
  assert.equal(sum, t.estimated);
  for (const k in t.estimatedBy) assert.ok(t.estimatedBy[k] <= t.units[k], k);
});
