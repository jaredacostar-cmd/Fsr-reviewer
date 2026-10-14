'use strict';
/*
 * Tests for the compact startup index (Phase 6):
 * scripts/build-snapshot-index.js (builder) and js/snapshot-index.js (hydrator).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { buildIndex, entryOf, countUnitsFromText, APPEAL_RE } = require('../scripts/build-snapshot-index.js');
const { hydrate } = require('../js/snapshot-index.js');
const P = require('../js/phases.js');
const { decodeRecord } = require('../scripts/build-snapshot.js');

const SNAP = { generatedAt: '2026-10-12T10:34:39.519Z', sinceYear: 2016, changes: { baseline: true } };
const HEADER = () => ({ muni: ['Brampton', 'Caledon', 'Mississauga'], phases: ['inception', 'review', 'approved', 'permit', 'construction', 'completed', 'cancelled'] });

// A project shaped like js/phases.js mergeProject() returns.
function makeProject(over = {}) {
  const rec = (kind, extra = {}) => ({
    kind, ref: '21T-M-11006', statusRaw: 'Application in process', address: '123 Main St',
    type: 'SUBDIVISION', description: '10 detached dwellings', units: 0, gfa: 0,
    phase: 'review', minor: false, unitMix: null, ...extra,
  });
  return {
    key: 'Mississauga|123 Main St',
    title: '123 Main St',
    municipality: 'Mississauga',
    phase: 'review',
    lat: 43.567891, lng: -79.712345,
    units: 120,
    kinds: ['application', 'permit'],
    newBuild: true,
    records: [rec('application', { units: 120 }), rec('permit', { ref: 'BP-22-001', statusRaw: 'Issued', phase: 'permit' })],
    timeline: [
      { date: new Date('2023-05-01T00:00:00Z'), phase: 'inception' },
      { date: new Date('2024-02-15T00:00:00Z'), phase: 'review' },
    ],
    milestones: { inception: new Date('2023-05-01T00:00:00Z'), approved: null, completed: null },
    last: new Date('2024-02-15T00:00:00Z'),
    buildout: { planned: 120, permitted: 0, completed: 0, remaining: 120, unbuilt: 120 },
    unitMix: null,
    types: ['SUBDIVISION'],
    description: '10 detached dwellings',
    siteAreaHa: 2.5,
    gfa: 0,
    ...over,
  };
}

const ALLOWED = new Set(['k', 't', 'm', 'ph', 'g', 'u', 'au', 'kd', 'nb', 'tm', 'l', 'ms', 'b', 'j', 'em', 'um', 'ty', 'd', 'h', 'sa', 'gfa', 'ap']);

test('index entries use only the allowlisted short keys', () => {
  const idx = buildIndex([makeProject()], SNAP);
  for (const e of idx.projects) for (const k of Object.keys(e)) assert.ok(ALLOWED.has(k), `unexpected key ${k}`);
  assert.deepEqual(Object.keys(idx).sort(), ['changes', 'generatedAt', 'muni', 'phases', 'projects', 'sinceYear', 'version'].sort());
});

test('round-trip: scalar fields survive the short-key mapping', () => {
  const p = makeProject();
  const h = hydrate(entryOf(p, { Mississauga: 2 }, require('../js/demand.js').DEFAULT_CRITERIA.m2PerJob), HEADER());
  assert.equal(h.key, p.key);
  assert.equal(h.title, p.title);
  assert.equal(h.municipality, 'Mississauga');
  assert.equal(h.phase, 'review');
  assert.equal(h.rank, 1); // review ranks 1, like PHASE_BY_KEY
  assert.equal(h.lat, 43.567891);
  assert.equal(h.lng, -79.712345);
  assert.equal(h.units, 120);
  assert.deepEqual(h.kinds, ['application', 'permit']);
  assert.equal(h.newBuild, true);
  assert.deepEqual(h.records, []);
  assert.deepEqual(h.types, ['SUBDIVISION']);
  assert.equal(h.description, '10 detached dwellings');
  assert.equal(h.siteAreaHa, 2.5);
});

test('round-trip: cancelled phase maps to rank -1', () => {
  const p = makeProject({ phase: 'cancelled' });
  const h = hydrate(entryOf(p, { Mississauga: 2 }, require('../js/demand.js').DEFAULT_CRITERIA.m2PerJob), HEADER());
  assert.equal(h.phase, 'cancelled');
  assert.equal(h.rank, -1);
});

test('round-trip: timeline, milestones and last activity', () => {
  const p = makeProject();
  const h = hydrate(entryOf(p, { Mississauga: 2 }, require('../js/demand.js').DEFAULT_CRITERIA.m2PerJob), HEADER());
  assert.deepEqual(h.timeline.map(t => [t.date.getUTCFullYear(), t.phase]), [[2023, 'inception'], [2024, 'review']]);
  assert.equal(h.milestones.inception.getUTCFullYear(), 2023);
  assert.equal(h.milestones.approved, undefined);
  assert.equal(h.last.getUTCFullYear(), 2024);
  assert.equal(h.last.getUTCMonth(), 1); // February, day precision kept
  assert.equal(h.first.getUTCFullYear(), 2023);
});

test('round-trip: build-out, app units and employment caches', () => {
  const p = makeProject();
  const h = hydrate(entryOf(p, { Mississauga: 2 }, require('../js/demand.js').DEFAULT_CRITERIA.m2PerJob), HEADER());
  assert.deepEqual(h.buildout, { planned: 120, permitted: 0, completed: 0, remaining: 120, unbuilt: 120 });
  assert.equal(h._appUnits, 120); // max over the planning applications
  assert.equal(h._emp, null); // no employment on a purely residential file
});

test('round-trip: employment jobs and floor space precomputed', () => {
  const p = makeProject({
    records: [{
      kind: 'application', ref: 'SPA-1', statusRaw: 'Approved', address: '123 Main St',
      type: 'OFFICE', description: 'Office building, 1000 sqm', units: 0, gfa: 1000,
      phase: 'approved', minor: false, unitMix: null,
    }],
  });
  const h = hydrate(entryOf(p, { Mississauga: 2 }, require('../js/demand.js').DEFAULT_CRITERIA.m2PerJob), HEADER());
  assert.ok(h._emp && h._emp.jobs > 0, 'expected jobs from the office floor area');
  assert.equal(h._emp.totalM2, 1000);
});

test('round-trip: search haystack covers title, description, types and record fields', () => {
  const p = makeProject();
  const h = hydrate(entryOf(p, { Mississauga: 2 }, require('../js/demand.js').DEFAULT_CRITERIA.m2PerJob), HEADER());
  for (const w of ['123 main st', '10 detached dwellings', 'subdivision', '21t-m-11006', 'application in process', 'bp-22-001', 'issued']) {
    assert.ok(h._hay.includes(w), `haystack missing ${w}`);
  }
});

test('appeal flag: set when a planning application is under appeal', () => {
  const yes = makeProject({ records: [{ kind: 'application', ref: 'R', statusRaw: 'OMB APPEAL', address: 'A', type: '', description: '', units: 0, phase: 'review', minor: false }] });
  const no = makeProject();
  const m2p = require('../js/demand.js').DEFAULT_CRITERIA.m2PerJob;
  assert.equal(entryOf(yes, { Mississauga: 2 }, m2p).ap, 1);
  assert.equal(entryOf(no, { Mississauga: 2 }, m2p).ap, undefined);
  assert.equal(hydrate(entryOf(yes, { Mississauga: 2 }, m2p), HEADER()).appeal, true);
  assert.equal(hydrate(entryOf(no, { Mississauga: 2 }, m2p), HEADER()).appeal, false);
});

test('appeal regex matches js/dev-detail.js STATUS_SIGNALS[0]', () => {
  globalThis.window = globalThis;
  globalThis.PeelUtil = require('../js/util.js');
  globalThis.PeelPhases = require('../js/phases.js');
  globalThis.PeelDemand = require('../js/demand.js');
  const DD = require('../js/dev-detail.js');
  assert.equal(APPEAL_RE.source, DD.STATUS_SIGNALS[0][0].source);
  assert.equal(APPEAL_RE.flags, DD.STATUS_SIGNALS[0][0].flags);
});

test('countUnitsFromText pulls unit counts out of descriptions', () => {
  const rs = [
    { kind: 'application', units: 0, description: 'Proposal: unit count: 2656, towers', unitMix: null },
    { kind: 'application', units: 100, description: 'unit count: 50', unitMix: null }, // existing count wins
    { kind: 'application', units: 0, description: 'unit count: 40', unitMix: { apartment: 40 } }, // mix wins
    { kind: 'permit', units: 0, description: 'unit count: 99', unitMix: null }, // permits skipped
  ];
  countUnitsFromText(rs);
  assert.equal(rs[0].units, 2656);
  assert.equal(rs[0].unitsFromText, true);
  assert.equal(rs[1].units, 100);
  assert.equal(rs[2].units, 0);
  assert.equal(rs[3].units, 0);
});

test('hydrate edge cases: no coords, no build-out, empty timeline', () => {
  const p = makeProject({ lat: null, lng: null, buildout: null, timeline: [], milestones: {}, last: null, units: null, newBuild: false });
  const h = hydrate(entryOf(p, { Mississauga: 2 }, require('../js/demand.js').DEFAULT_CRITERIA.m2PerJob), HEADER());
  assert.equal(h.lat, null);
  assert.equal(h.lng, null);
  assert.equal(h.buildout, null);
  assert.deepEqual(h.timeline, []);
  assert.equal(h.last, null);
  assert.equal(h.first, null);
  assert.equal(h.units, null);
  assert.equal(h.newBuild, false);
});

// True round-trip on real data: index a slice of the committed snapshot and
// verify every hydrated field against the project buildProjects produced.
test('round-trip on real snapshot records', () => {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'snapshot.json'), 'utf8'));
  const names = new Map(snap.sources.map(s => [s.id, s.name]));
  const rootId = id => String(id).split('/')[0];
  const slice = snap.records.slice(0, 400);
  const decoded = slice.map(o => decodeRecord(o, names.get(rootId(o.sourceId))));
  countUnitsFromText(decoded);
  const projects = P.buildProjects(P.dedupeRecords(decoded));
  assert.ok(projects.length > 5, 'expected several projects from the slice');
  const idx = buildIndex(projects, snap);
  const ymd = d => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  for (const p of projects) {
    const e = idx.projects.find(x => x.k === p.key);
    assert.ok(e, `index missing project ${p.key}`);
    const h = hydrate(e, idx);
    assert.equal(h.key, p.key);
    assert.equal(h.title, p.title);
    assert.equal(h.municipality, p.municipality);
    assert.equal(h.phase, p.phase);
    assert.equal(h.rank, P.PHASE_BY_KEY[p.phase].rank);
    assert.equal(h.lat, p.lat == null ? null : +p.lat.toFixed(6));
    assert.equal(h.lng, p.lng == null ? null : +p.lng.toFixed(6));
    assert.equal(h.units, p.units ?? null);
    assert.deepEqual(h.kinds, p.kinds);
    assert.equal(h.newBuild, p.newBuild);
    // (year, phase) pairs, deduped, in timeline order
    const want = [], seen = new Set();
    for (const t of p.timeline) {
      const k = `${t.date.getUTCFullYear()}|${t.phase}`;
      if (!seen.has(k)) { seen.add(k); want.push([t.date.getUTCFullYear(), t.phase]); }
    }
    assert.deepEqual(h.timeline.map(t => [t.date.getUTCFullYear(), t.phase]), want);
    for (const m of ['inception', 'approved', 'completed']) {
      assert.equal(h.milestones[m] ? ymd(h.milestones[m]) : undefined, p.milestones[m] ? ymd(p.milestones[m]) : undefined, `${p.key} milestone ${m}`);
    }
    assert.equal(h.last ? ymd(h.last) : null, p.last ? ymd(p.last) : null);
    assert.deepEqual(h.buildout, p.buildout ? {
      planned: p.buildout.planned, permitted: p.buildout.permitted, completed: p.buildout.completed,
      remaining: p.buildout.remaining, unbuilt: p.buildout.unbuilt,
    } : null);
    assert.equal(h._appUnits, Math.max(0, ...p.records.filter(r => r.kind === 'application').map(r => r.units || 0)));
    assert.equal(h.types.join('|'), p.types.join('|'));
    assert.equal(h.description, p.description || '');
    assert.equal(h.siteAreaHa, p.siteAreaHa ?? null);
    assert.equal(h.gfa, p.gfa ?? null);
    // search parity: every word the full project's haystack has, the light one has too
    const fullHay = [p.title, p.description, ...p.types, ...p.records.map(r => `${r.ref} ${r.statusRaw} ${r.address}`)].join(' ').toLowerCase();
    for (const w of new Set(fullHay.split(/\s+/).filter(Boolean))) assert.ok(h._hay.includes(w), `${p.key}: haystack missing ${w}`);
  }
});
