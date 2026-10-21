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

test('model: with the file tree, the planning files follow it (indented), then the rest by type', () => {
  const FT = require('../js/file-tree.js');
  const d = { root: 'OZ 1', u: 50, n: [['OZ 1', 1, -1, '', 'h', 0, 50, 0, 'k1'], ['SP 2', 2, 0, '', 'l', 0, 0, 0, 'k2'], ['OLD 3', 2, -1, '', 'h', 0, 0, 0, 'k3']], c: [['OZ 1', 50, 'stated']] };
  const recs = [rec({ uid: 'a', ref: 'OZ 1', events: [ev('2020-01-01', 'review')] }), rec({ uid: 'b', ref: 'SP 2', stage: 'siteplan', events: [ev('2022-01-01', 'review')] }),
    rec({ uid: 'c', ref: 'OLD 3', stage: 'siteplan', phase: 'completed', events: [ev('2005-01-01', 'approved')] }), rec({ uid: 'e', ref: 'X 9', stage: 'condo', events: [ev('2023-01-01', 'review')] })];
  const by = new Map(recs.map(r => [r.ref, r]));
  const m = G.model(project({ records: recs }), { now: NOW, tree: FT.flat(d), recOf: n => by.get(n.ref) || null, latest: 'X 9' });
  const files = m.rows.filter(r => r.kind === 'file');
  assert.deepEqual(files.map(r => [r.ref, r.depth || 0]), [['OZ 1', 0], ['SP 2', 1], ['OLD 3', 0], ['X 9', 0]]);
  assert.equal(files[0].counted.units, 50);
  assert.ok(files[1].check, 'linked by overlap only');
  assert.ok(files[3].latest);
  assert.deepEqual(m.rows.filter(r => r.kind === 'head').map(r => r.label), ['Planning files', 'Earlier files on the same land', 'Other condominium files']);
});

test('html: a row with a body opens to it, and carries its record for the file links', () => {
  const p = project({ records: [rec({ events: [ev('2022-01-01', 'review')] })] });
  const h = G.html(p, { now: NOW, body: r => (r.kind === 'file' ? 'THE RECORD' : '') });
  assert.match(h, /<details class="gt-d gt-file" data-rec-uid="u1" data-rec-ref="OZ 22-001"><summary class="gt-row">/);
  assert.match(h, /<div class="gt-body"[^>]*>THE RECORD<\/div><\/details>/);
});

test('html: text is escaped; nothing to show says so', () => {
  const p = project({ records: [rec({ ref: 'OZ <1>', events: [ev('2022-01-01', 'review')] })] });
  const h = G.html(p, { now: NOW });
  assert.match(h, /OZ &lt;1&gt;/);
  assert.match(h, /var\(--ph-review\)/);
  assert.match(G.html(project(), { now: NOW }), /No files or dated events/);
});

test('model: with the file tree, files that began before their parent (its pre-consultations) lead it', () => {
  const FT = require('../js/file-tree.js');
  const d = { root: 'OZ 1', u: 50, n: [['OZ 1', 1, -1, '', 'h', 0, 50, 0, 'k1'], ['PRE 2', 2, 0, '', 'h', 0, 0, 0, 'k2'], ['PRE 3', 2, 0, '', 'h', 0, 0, 0, 'k3']], c: [['OZ 1', 50, 'stated']] };
  const recs = [rec({ uid: 'a', ref: 'OZ 1', events: [ev('2022-01-01', 'review')] }), rec({ uid: 'b', ref: 'PRE 2', events: [ev('2021-03-01', 'review')] }),
    rec({ uid: 'c', ref: 'PRE 3', events: [ev('2023-03-01', 'review')] })];
  const by = new Map(recs.map(r => [r.ref, r]));
  const m = G.model(project({ records: recs }), { now: NOW, tree: FT.flat(d), recOf: n => by.get(n.ref) || null });
  assert.deepEqual(m.rows.filter(r => r.kind === 'file').map(r => r.ref), ['PRE 2', 'OZ 1', 'PRE 3']);
});

test('model: a file that leads the one it belongs to sheds its indent; each planning file links to the next', () => {
  const FT = require('../js/file-tree.js');
  const d = { root: 'OZ 1', u: 50, n: [['OZ 1', 1, -1, '', 'h', 0, 50, 0, 'k1'], ['PRE 2', 2, 0, '', 'h', 0, 0, 0, 'k2'], ['PRE 3', 2, 0, '', 'h', 0, 0, 0, 'k3']], c: [['OZ 1', 50, 'stated']] };
  const recs = [rec({ uid: 'a', ref: 'OZ 1', events: [ev('2022-01-01', 'review')] }), rec({ uid: 'b', ref: 'PRE 2', events: [ev('2021-03-01', 'review')] }),
    rec({ uid: 'c', ref: 'PRE 3', events: [ev('2023-03-01', 'review')] })];
  const by = new Map(recs.map(r => [r.ref, r]));
  const m = G.model(project({ records: recs }), { now: NOW, tree: FT.flat(d), recOf: n => by.get(n.ref) || null });
  const files = m.rows.filter(r => r.kind === 'file');
  assert.deepEqual(files.map(r => [r.ref, r.depth]), [['PRE 2', 0], ['OZ 1', 0], ['PRE 3', 1]]);
  assert.deepEqual(files.map(r => [r.wfFrom || null, !!r.wfOut]), [[null, true], [+ev('2021-03-01').date, true], [+ev('2022-01-01').date, false]]);
  const h = G.html(project({ records: recs }), { now: NOW, tree: FT.flat(d), recOf: n => by.get(n.ref) || null });
  assert.equal((h.match(/class="gt-wf-in/g) || []).length, 2);
  assert.equal((h.match(/class="gt-wf-dn/g) || []).length, 2);
});
