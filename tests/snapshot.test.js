'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSnapshot, decodeRecord } = require('../scripts/build-snapshot.js');
const P = require('../js/phases.js');

// Minimal ArcGIS stand-in: one application layer and one permit layer.
function mockServer(state) {
  const fields = {
    apps: ['OBJECTID:esriFieldTypeOID', 'FILE_NO:esriFieldTypeString', 'ADDRESS:esriFieldTypeString', 'STATUS:esriFieldTypeString', 'RECEIVED_DATE:esriFieldTypeDate', 'UNITS:esriFieldTypeInteger'],
    permits: ['OBJECTID:esriFieldTypeOID', 'BP_NO:esriFieldTypeString', 'ADDRESS:esriFieldTypeString', 'PERMIT_TYPE:esriFieldTypeString', 'STATUS:esriFieldTypeString', 'ISSUE_DATE:esriFieldTypeDate'],
  };
  return async (url, init) => {
    const u = new URL(url);
    const params = init && init.body ? new URLSearchParams(init.body) : u.searchParams;
    const reply = obj => ({ ok: true, status: 200, json: async () => obj });
    if (u.hostname === 'hub.arcgis.com') return reply({ orgId: 'ORG' });
    if (u.hostname === 'www.arcgis.com') return reply({ results: [], nextStart: -1 });
    const m = u.pathname.match(/services\/(\w+)\/FeatureServer(?:\/(\d+))?(\/query)?/);
    const svc = m[1];
    if (state.down && state.down.includes(svc)) return { ok: false, status: 503, json: async () => ({}) };
    if (m[3]) {
      const off = +params.get('resultOffset') || 0;
      const feats = state[svc].slice(off, off + 1000);
      return reply({ type: 'FeatureCollection', features: feats, properties: { exceededTransferLimit: false } });
    }
    if (m[2] != null) return reply({ name: svc, geometryType: 'esriGeometryPoint', supportedQueryFormats: 'JSON, geoJSON', maxRecordCount: 1000, advancedQueryCapabilities: { supportsPagination: true },
      fields: fields[svc].map(s => { const [name, type] = s.split(':'); return { name, type }; }) });
    return reply({ layers: [{ id: 0, name: svc, type: 'Feature Layer' }] });
  };
}

const pt = { type: 'Point', coordinates: [-79.65, 43.59] };
const feat = (id, props) => ({ type: 'Feature', id, geometry: pt, properties: { OBJECTID: id, ...props } });
const cfg = {
  bbox: { xmin: -80.2, ymin: 43.4, xmax: -79.4, ymax: 44.1 }, sinceYear: 2016, pageSize: 1000,
  services: [
    { id: 'apps', name: 'Apps', municipality: 'Mississauga', kind: 'application', url: 'https://x.test/arcgis/rest/services/apps/FeatureServer' },
    { id: 'permits', name: 'Permits', municipality: 'Mississauga', kind: 'permit', url: 'https://x.test/arcgis/rest/services/permits/FeatureServer' },
  ],
  hubs: [{ municipality: 'Mississauga', host: 'example.test' }],
  discoverQuery: 'x', discoverExclude: /never/, permitPattern: /permit/i,
};

test('weekly runs record new projects and phase changes; outages keep last week', async () => {
  const realFetch = global.fetch;
  const state = {
    apps: [feat(1, { FILE_NO: 'SP 1', ADDRESS: '1 Main St', STATUS: 'Under Review', RECEIVED_DATE: Date.UTC(2024, 0, 1), UNITS: 300 })],
    permits: [
      feat(1, { BP_NO: 'BP 9', ADDRESS: '9 King St', PERMIT_TYPE: 'New apartment building', STATUS: 'Issued', ISSUE_DATE: Date.UTC(2025, 0, 1) }),
      feat(2, { BP_NO: 'BP 10', ADDRESS: '9 King St', PERMIT_TYPE: 'Deck', STATUS: 'Issued', ISSUE_DATE: Date.UTC(2025, 0, 1) }),
    ],
  };
  global.fetch = mockServer(state);
  const quiet = () => {};
  try {
    // Week 1: baseline.
    const w1 = await buildSnapshot({ cfg, now: new Date('2026-10-05T10:00:00Z'), log: quiet });
    assert.equal(w1.snapshot.changes.baseline, true);
    assert.equal(w1.snapshot.records.length, 2, 'deck permit is not a new build and is dropped');
    assert.equal(w1.summary.projects, 2);

    // Week 2: application approved, a new application appears.
    state.apps[0].properties.STATUS = 'Approved';
    state.apps.push(feat(2, { FILE_NO: 'OZ 2', ADDRESS: '5 Queen St', STATUS: 'Pre-consultation', RECEIVED_DATE: Date.UTC(2026, 9, 1), UNITS: 40 }));
    const w2 = await buildSnapshot({ cfg, previous: w1.snapshot, history: w1.history, now: new Date('2026-10-12T10:00:00Z'), log: quiet });
    const ch = w2.snapshot.changes;
    assert.equal(ch.since, '2026-10-05');
    assert.deepEqual(ch.added.map(a => [a.title, a.phase]), [['5 Queen St', 'inception']]);
    assert.deepEqual(ch.moved.map(m => [m.title, m.from, m.to]), [['1 Main St', 'review', 'approved']]);
    const key = ch.moved[0].key;
    assert.deepEqual(w2.history.projects[key], [['2026-10-05', 'review'], ['2026-10-12', 'approved']]);

    // Week 3: permits service down -> last week's permit records are carried over.
    state.down = ['permits'];
    const w3 = await buildSnapshot({ cfg, previous: w2.snapshot, history: w2.history, now: new Date('2026-10-19T10:00:00Z'), log: quiet });
    const ps = w3.snapshot.sources.find(s => s.id === 'permits');
    assert.equal(ps.status, 'stale');
    assert.equal(ps.updated, '2026-10-12');
    assert.equal(w3.snapshot.records.filter(r => r.kind === 'permit').length, 1);

    // Everything down -> refuse to write.
    state.down = ['permits', 'apps'];
    await assert.rejects(buildSnapshot({ cfg, previous: w3.snapshot, history: w3.history, log: quiet }), /every source failed/);

    // Encoded records round-trip into what the app's project builder expects.
    const recs = w3.snapshot.records.map(o => decodeRecord(o, 'x'));
    assert.ok(recs.every(r => r.events.every(e => e.date instanceof Date)));
    assert.equal(P.buildProjects(P.dedupeRecords(recs)).length, 3);
  } finally {
    global.fetch = realFetch;
  }
});
