'use strict';
/* Phase 3b tool 5 tests: the pure buildDraft(fields) text builder in
 * js/tools-inquiry.js. No DOM, no app bridge — require the module directly. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDraft } = require('../js/tools-inquiry.js');

function fullFields() {
  return {
    title: '123 Main St W',
    sub: 'Mississauga · review',
    site: '43.12345, -79.12345',
    program: '200 units (200 apartment) · ~410 people',
    programNote: null,
    water: { zone: 'Zone 3', avg: 2.1, maxDay: 4.2, peakHour: 6.8 },
    wastewater: {
      path: ['Bolton trunk', 'G.E. Booth WRRF inflow'],
      nearest: '750 mm sanitary sewer, 92% of full capacity at build-out (screening estimate)',
      avg: 1.8, peak: 4.5, wetPeak: 6.1,
      plant: 'G.E. Booth WRRF', plantReserve: 12.3,
    },
    constraints: [
      { name: '750 mm sanitary sewer', detail: 'slope 0.42%', status: 'runs out before a DC project relieves it', out: '≈2029' },
      { name: 'Bolton pumping station', detail: 'firm 100 L/s', status: 'DC project in time', out: '≈2031' },
    ],
    noServicing: false,
    snapshotDate: '2026-10-07',
    preparedDate: '2026-10-14',
  };
}

test('buildDraft renders every section in order', () => {
  const t = buildDraft(fullFields());
  const sections = [
    'Servicing inquiry summary — 123 Main St W',
    'Mississauga · review',
    'Prepared 2026-10-14',
    'Site: 43.12345, -79.12345',
    'Proposed program (screening estimate): 200 units',
    'Water (Peel design criteria, screening estimate)',
    'Pressure zone: Zone 3',
    'Wastewater (Peel design criteria, screening estimate)',
    'Sewer path: Bolton trunk → G.E. Booth WRRF inflow',
    'Treatment: G.E. Booth WRRF · uncommitted reserve 12.3 ML/d',
    'Tightest constraint',
    '750 mm sanitary sewer — slope 0.42%',
    'Other constraints',
    'Bolton pumping station',
    'Caveats',
    'not a hydraulic model',
    'Data dates',
    '2026-10-07 (weekly snapshot)',
    'Unofficial prototype · public data only · not a Region of Peel product',
    'Prepared by Peel Growth Pipeline (unofficial)',
  ];
  let last = -1;
  for (const s of sections) {
    const i = t.indexOf(s);
    assert.ok(i > last, `section present and in order: ${s}`);
    last = i;
  }
});

test('buildDraft marks capacity figures as screening estimates', () => {
  const t = buildDraft(fullFields());
  assert.ok(t.includes('screening estimate'));
  assert.ok(!t.includes('<') && !t.includes('>') || t.includes('→'), 'plain text, no HTML tags');
  assert.ok(!t.includes('&amp;'), 'no HTML entities');
});

test('buildDraft with no servicing model explains the gap', () => {
  const t = buildDraft({ ...fullFields(), water: null, wastewater: null, constraints: [], noServicing: true });
  assert.ok(t.includes('servicing model has not loaded'));
  assert.ok(!t.includes('Tightest constraint'));
});

test('buildDraft with no constraints says none flagged', () => {
  const t = buildDraft({ ...fullFields(), constraints: [] });
  assert.ok(t.includes('none flagged'));
});

test('buildDraft handles a point with no program', () => {
  const t = buildDraft({
    ...fullFields(), title: 'Point 43.1, -79.1', sub: null, program: null,
    programNote: 'No development program was supplied.',
    constraints: [],
  });
  assert.ok(t.includes('No development program was supplied.'));
  assert.ok(!t.includes('Proposed program'));
});

test('buildDraft never throws on empty fields', () => {
  const t = buildDraft({});
  assert.ok(t.includes('Servicing inquiry summary'));
  assert.ok(t.includes('not a Region of Peel product'));
});
