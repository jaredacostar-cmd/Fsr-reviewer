'use strict';
/* Weekly alerts feed (Phase 7, Feature 4): change detection, significance
 * rules, threshold crossings, feed shape and RSS output. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const A = require('../scripts/build-alerts.js');
const AL = require('../js/alerts.js');

const repo = path.resolve(__dirname, '..');
const reports = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'peel-reports.json'), 'utf8'));
const servicing = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'servicing.json'), 'utf8'));
const REFS = { plants: reports.wastewater.plants, sps: reports.masterPlan.sps, areas: servicing.drainageAreas };

// ---- Fixture helpers ------------------------------------------------------------
// Minimal encoded-snapshot records. Note: the app's phase model reads an
// application with phase 'approved' as review unless its stage is siteplan
// (see js/phases.js sitePhaseOf), so approved fixtures carry stage 'siteplan'.
const rec = (uid, muni, addr, phase, units, lat, lng, stage) => ({
  uid, sourceId: 't', municipality: muni, kind: 'application', ref: uid, address: addr,
  type: 'APARTMENT', description: `${units} apartment units`, statusRaw: '', phase,
  stage, units, lat, lng,
});
const snap = records => ({ generatedAt: '2026-10-12T10:00:00Z', records });
const sums = s => [...A.summarizeSnapshot(s).values()];
const byKey = arr => new Map(arr.map(x => [x.key, x]));

// A point inside a Clarkson drainage area (deterministic against the committed
// servicing.json).
const clarksonArea = servicing.drainageAreas.find(d => d.plant === 'Clarkson' && d.rings);
const CPT = clarksonArea.rings[0][0]; // [lng, lat]

test('diffSummaries: finds added, removed, phase and unit changes', () => {
  const prev = sums(snap([
    rec('a1', 'Mississauga', '100 Main St', 'review', 200, 43.55, -79.65),
    rec('a2', 'Brampton', '200 Queen St', 'approved', 1000, 43.68, -79.76, 'siteplan'),
    rec('a3', 'Caledon', '300 King St', 'review', 40, 43.85, -79.85),
  ]));
  const next = sums(snap([
    rec('a1', 'Mississauga', '100 Main St', 'approved', 200, 43.55, -79.65, 'siteplan'),
    rec('a2', 'Brampton', '200 Queen St', 'approved', 1600, 43.68, -79.76, 'siteplan'),
    rec('a4', 'Mississauga', '400 Oak St', 'review', 5, 43.56, -79.66),
  ]));
  const diff = A.diffSummaries(byKey(prev), byKey(next));
  const kinds = Object.fromEntries(diff.map(d => [d.key, d.kind]));
  assert.equal(kinds['Mississauga|100 MAIN ST'], 'phase');
  assert.equal(kinds['Brampton|200 QUEEN ST'], 'units');
  assert.equal(kinds['Mississauga|400 OAK ST'], 'added');
  assert.equal(kinds['Caledon|300 KING ST'], 'removed');
  const ph = diff.find(d => d.kind === 'phase');
  assert.equal(ph.from, 'review');
  assert.equal(ph.to, 'approved');
  const un = diff.find(d => d.kind === 'units');
  assert.equal(un.unitsPrev, 1000);
  assert.equal(un.unitsNew, 1600);
});

test('diffSummaries: identical snapshots produce no changes', () => {
  const records = [rec('a1', 'Mississauga', '100 Main St', 'review', 200, 43.55, -79.65)];
  assert.deepEqual(A.diffSummaries(byKey(sums(snap(records))), byKey(sums(snap(records)))), []);
});

test('isSignificant: phase always; new/removed under 10 units are noise; unit moves need 50 units and 10%', () => {
  assert.ok(A.isSignificant({ kind: 'phase' }));
  assert.ok(!A.isSignificant({ kind: 'added', units: 5 }));
  assert.ok(A.isSignificant({ kind: 'added', units: 10 }));
  assert.ok(A.isSignificant({ kind: 'added', units: null }));
  assert.ok(!A.isSignificant({ kind: 'removed', units: 9 }));
  assert.ok(!A.isSignificant({ kind: 'units', unitsPrev: 1000, unitsNew: 1040 })); // < 50 units
  assert.ok(!A.isSignificant({ kind: 'units', unitsPrev: 1000, unitsNew: 1060 })); // 60 units but 6%
  assert.ok(A.isSignificant({ kind: 'units', unitsPrev: 1000, unitsNew: 1600 }));
  assert.ok(A.isSignificant({ kind: 'units', unitsPrev: 0, unitsNew: 60 })); // from nothing
});

test('changeItems: item shape, absolute URLs, kind mapping, noise filtered', () => {
  const prev = sums(snap([
    rec('a1', 'Mississauga', '100 Main St', 'review', 200, 43.55, -79.65),
    rec('a2', 'Brampton', '200 Queen St', 'approved', 1000, 43.68, -79.76, 'siteplan'),
  ]));
  const next = sums(snap([
    rec('a1', 'Mississauga', '100 Main St', 'approved', 200, 43.55, -79.65, 'siteplan'),
    rec('a2', 'Brampton', '200 Queen St', 'approved', 1600, 43.68, -79.76, 'siteplan'),
    rec('a4', 'Mississauga', '400 Oak St', 'review', 5, 43.56, -79.66), // noise: filtered
  ]));
  const items = A.changeItems(A.diffSummaries(byKey(prev), byKey(next)), '2026-10-19');
  assert.equal(items.length, 2);
  for (const it of items) {
    assert.match(it.id, /^2026-10-19:[a-z-]+:[a-z0-9-]+$/);
    assert.equal(it.date, '2026-10-19');
    assert.ok(it.title.length > 0 && it.text.length > 0);
    assert.ok(it.url.startsWith('https://jaredacostar-cmd.github.io/peel-growth-pipeline/?d='));
    assert.ok(it.development && it.development.key);
  }
  const kinds = items.map(i => i.kind).sort();
  assert.deepEqual(kinds, ['phase-change', 'units-change']);
  const ph = items.find(i => i.kind === 'phase-change');
  assert.match(ph.text, /Under review → Draft \/ site plan approved/);
  assert.match(ph.text, /Mississauga/);
  const un = items.find(i => i.kind === 'units-change');
  assert.match(un.text, /1,000 → 1,600/);
});

test('crossings: highest band up, lowest band down, one item per key', () => {
  const up = A.crossings({ a: 0.1 }, { a: 0.96 }, [0.25, 0.5, 0.75, 1.0]);
  assert.deepEqual(up, [{ key: 'a', prev: 0.1, next: 0.96, level: 0.75, dir: 'up' }]);
  const down = A.crossings({ a: 0.96 }, { a: 0.1 }, [0.25, 0.5, 0.75, 1.0]);
  assert.deepEqual(down, [{ key: 'a', prev: 0.96, next: 0.1, level: 0.25, dir: 'down' }]);
  assert.deepEqual(A.crossings({ a: 0.5 }, { a: 0.5 }, [0.25]), []);
  assert.deepEqual(A.crossings({ a: 0.1 }, { a: 0.2 }, [0.25]), []);
  assert.deepEqual(A.crossings({}, { a: 0.9 }, [0.25]), []); // new key: no previous baseline
});

test('plant threshold: Clarkson committed share crossing 75% up', () => {
  // Clarkson baseline is 211.9/350 = 60.5%; 70,000 approved units push it over 75%.
  const prev = sums(snap([]));
  const next = sums(snap([rec('big1', 'Mississauga', '999 Test Rd', 'approved', 70000, CPT[1], CPT[0], 'siteplan')]));
  const pPrev = A.plantShares(prev, REFS.plants, REFS.areas);
  const pNew = A.plantShares(next, REFS.plants, REFS.areas);
  assert.ok(pPrev.Clarkson.share < 0.75, `prev share ${pPrev.Clarkson.share}`);
  assert.ok(pNew.Clarkson.share >= 0.75, `new share ${pNew.Clarkson.share}`);
  const items = A.thresholdItems(pPrev, pNew, {}, {}, '2026-10-19');
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.kind, 'plant-threshold');
  assert.equal(it.plant, 'Clarkson');
  assert.match(it.title, /crossed 75%/);
  assert.match(it.text, /61% → 7\d%/);
  assert.ok(it.url.startsWith('https://jaredacostar-cmd.github.io/'));
});

test('plant threshold: no item when nothing crosses', () => {
  const prev = sums(snap([]));
  const next = sums(snap([rec('s1', 'Mississauga', '111 Small St', 'approved', 50, CPT[1], CPT[0], 'siteplan')]));
  const items = A.thresholdItems(
    A.plantShares(prev, REFS.plants, REFS.areas), A.plantShares(next, REFS.plants, REFS.areas), {}, {}, '2026-10-19');
  assert.deepEqual(items, []);
});

test('station threshold: committed growth load crossing a firm-capacity band', () => {
  // A large approved project inside a pumping-station drainage area.
  const psArea = servicing.drainageAreas.find(d => d.kind === 'ps' && d.rings);
  const pt = psArea.rings[0][0];
  const prev = sums(snap([]));
  const next = sums(snap([rec('s1', 'Mississauga', '222 Pump St', 'approved', 20000, pt[1], pt[0], 'siteplan')]));
  const lPrev = A.stationLoads(prev, REFS.sps, REFS.areas);
  const lNew = A.stationLoads(next, REFS.sps, REFS.areas);
  const items = A.thresholdItems({}, {}, lPrev, lNew, '2026-10-19');
  assert.ok(items.length >= 1, 'expected at least one station-threshold item');
  for (const it of items) {
    assert.equal(it.kind, 'station-threshold');
    assert.ok(it.station && it.station.length > 0);
    assert.match(it.text, /firm capacity/);
  }
});

test('buildFeed: shape, ordering, counts', () => {
  const prev = snap([
    rec('a1', 'Mississauga', '100 Main St', 'review', 200, 43.55, -79.65),
    rec('a2', 'Brampton', '200 Queen St', 'approved', 1000, 43.68, -79.76, 'siteplan'),
  ]);
  const next = snap([
    rec('a1', 'Mississauga', '100 Main St', 'approved', 200, 43.55, -79.65, 'siteplan'),
    rec('a2', 'Brampton', '200 Queen St', 'approved', 1600, 43.68, -79.76, 'siteplan'),
    rec('big1', 'Mississauga', '999 Test Rd', 'approved', 70000, CPT[1], CPT[0], 'siteplan'),
  ]);
  const feed = A.buildFeed({ prevSnap: prev, newSnap: next, date: '2026-10-19', refs: REFS });
  assert.equal(feed.version, 1);
  assert.ok(feed.generated);
  assert.equal(feed.since, '2026-10-12');
  assert.equal(feed.until, '2026-10-19');
  assert.equal(feed.site, A.SITE_URL);
  assert.equal(feed.baseline, false);
  const kinds = feed.items.map(i => i.kind);
  assert.ok(kinds.includes('plant-threshold'));
  assert.ok(kinds.includes('phase-change'));
  assert.ok(kinds.includes('units-change'));
  assert.ok(kinds.includes('new-development'));
  // Threshold items sort before change items.
  assert.ok(kinds.indexOf('plant-threshold') < kinds.indexOf('phase-change'));
  assert.deepEqual(feed.counts['phase-change'], 1);
  assert.equal(feed.items.length, Object.values(feed.counts).reduce((a, b) => a + b, 0));
});

test('emptyFeed: baseline feed with no items', () => {
  const feed = A.emptyFeed('2026-10-19');
  assert.equal(feed.baseline, true);
  assert.deepEqual(feed.items, []);
  assert.equal(feed.until, '2026-10-19');
});

test('toRSS: valid RSS 2.0 with escaped content and absolute links', () => {
  const feed = {
    version: 1, generated: '2026-10-19T10:30:00.000Z', since: '2026-10-12', until: '2026-10-19',
    site: A.SITE_URL, baseline: false, counts: {},
    items: [{
      id: '2026-10-19:phase-change:x', date: '2026-10-19', kind: 'phase-change',
      title: '100 Main & 2nd <St> — phase change', text: 'Review → Approved · A&B Corp',
      development: { key: 'k', title: 't', municipality: 'm', phase: 'approved' },
      url: 'https://jaredacostar-cmd.github.io/peel-growth-pipeline/?d=k',
    }],
  };
  const rss = A.toRSS(feed);
  assert.match(rss, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(rss, /<rss version="2\.0">/);
  assert.match(rss, /<title>Peel Development Tracker — weekly alerts<\/title>/);
  assert.match(rss, /<link>https:\/\/jaredacostar-cmd\.github\.io\/peel-growth-pipeline\/<\/link>/);
  assert.match(rss, /<title>100 Main &amp; 2nd &lt;St&gt; — phase change<\/title>/);
  assert.match(rss, /<description>Review → Approved · A&amp;B Corp<\/description>/);
  assert.match(rss, /<guid isPermaLink="false">2026-10-19:phase-change:x<\/guid>/);
  assert.match(rss, /<pubDate>[A-Z][a-z]{2}, 19 Oct 2026 \d\d:\d\d:\d\d GMT<\/pubDate>/);
});

test('js/alerts.js: devItems matches watched keys; infraItems takes the rest', () => {
  const feed = { items: [
    { kind: 'phase-change', date: '2026-10-19', development: { key: 'A' } },
    { kind: 'new-development', date: '2026-10-19', development: { key: 'B' } },
    { kind: 'plant-threshold', date: '2026-10-19', plant: 'Clarkson' },
    { kind: 'station-threshold', date: '2026-10-19', station: 'X' },
  ] };
  assert.deepEqual(AL.devItems(feed, ['A', 'C']).map(i => i.kind), ['phase-change']);
  assert.equal(AL.infraItems(feed).length, 2);
  assert.deepEqual(AL.unseen(feed, '2026-10-12').length, 4);
});

test('js/alerts.js: unseen filters by seen date; kindLabel covers kinds', () => {
  const feed = { items: [{ date: '2026-10-19' }, { date: '2026-10-12' }] };
  assert.equal(AL.unseen(feed, '2026-10-12').length, 1);
  assert.equal(AL.unseen(feed, null).length, 2);
  assert.equal(AL.kindLabel('phase-change'), 'Phase change');
  assert.equal(AL.kindLabel('plant-threshold'), 'Plant capacity');
  assert.equal(AL.kindLabel('station-threshold'), 'Pumping station');
  assert.equal(AL.kindLabel('bogus'), 'bogus');
});
