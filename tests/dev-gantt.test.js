'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.PeelPhases = require('../js/phases.js');
const G = require('../js/dev-gantt.js');

const NOW = Date.UTC(2026, 9, 20);
const ev = (iso, phase, label = 'Date') => ({ date: new Date(`${iso}T12:00:00Z`), phase, label });
const rec = (extra = {}) => ({ uid: 'u1', ref: 'OZ 22-001', kind: 'application', stage: 'master', phase: 'review', statusRaw: '', type: 'Rezoning', events: [], ...extra });
const project = (extra = {}) => ({ key: 'p1', title: 'Test', phase: 'review', milestones: {}, records: [], ...extra });

test('segments: each event runs to the next; an open file runs to today', () => {
  const { segs } = G.segments([ev('2022-01-01', 'inception'), ev('2023-01-01', 'review')], 'review', NOW);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].phase, 'inception');
  assert.equal(segs[0].to, +new Date('2023-01-01T12:00:00Z'));
  assert.equal(segs[1].to, NOW);
  assert.ok(segs[1].open);
});

test('segments: a completed file stops at its last event', () => {
  const { segs } = G.segments([ev('2022-01-01', 'permit'), ev('2023-06-01', 'completed')], 'completed', NOW);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].phase, 'permit');
});

test('segments: a file approved by its status, with only its received date, runs on in the approved stage', () => {
  const { segs } = G.segments([ev('2022-01-01', 'inception')], 'approved', NOW);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].phase, 'approved');
  assert.ok(segs[0].undated);
});

test('model: stage row, council row, a head and a row per file, whole-year span', () => {
  const p = project({
    milestones: { inception: new Date('2021-03-01'), review: new Date('2021-06-01') },
    records: [rec({ events: [ev('2021-03-01', 'inception'), ev('2021-06-01', 'review')] }),
      rec({ uid: 'u2', ref: 'SP 23-010', stage: 'siteplan', events: [ev('2023-02-01', 'review')] }),
      rec({ uid: 'u3', ref: 'X', events: [] })],
  });
  const council = [{ m: { date: '2022-05-10', name: 'Planning and Development Committee' }, it: { n: '4.1', title: 'Report' }, s: { verdict: 'Received' } }];
  const m = G.model(p, { now: NOW, council });
  assert.deepEqual(m.rows.map(r => r.kind), ['stage', 'council', 'head', 'file', 'head', 'file']);
  assert.equal(m.from, Date.UTC(2021, 0, 1));
  assert.equal(m.to, Date.UTC(2027, 0, 1));
});

test('model: many permits in a group share one row', () => {
  const permits = Array.from({ length: G.PERMIT_ROWS + 1 }, (_, i) => rec({ uid: `b${i}`, ref: `BP ${i}`, kind: 'permit', stage: undefined, phase: 'completed', units: 0, events: [ev('2024-01-01', 'permit'), ev('2025-01-01', 'completed')] }));
  const m = G.model(project({ records: permits }), { now: NOW });
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].kind, 'group');
  assert.equal(m.rows[0].ev.length, permits.length * 2);
  assert.equal(m.rows[0].segs[0].open, false);
});

test('html: file numbers open their record; nothing dated says so; text is escaped', () => {
  const p = project({ records: [rec({ ref: 'OZ <1>', events: [ev('2022-01-01', 'review')] })] });
  const h = G.html(p, { now: NOW });
  assert.match(h, /data-dev-file="OZ &lt;1&gt;"/);
  assert.match(h, /var\(--ph-review\)/);
  assert.match(G.html(project(), { now: NOW }), /No dated events/);
});
