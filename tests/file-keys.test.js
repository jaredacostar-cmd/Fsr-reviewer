'use strict';
// One planning file, one key: Caledon numbers its files "YYYY-NNNN" separately for each application
// type (js/phases.js fileId). Synthetic records only.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const T = require('../js/tree.js');
const TG = require('../js/tree-groups.js');
const TC = require('../js/tree-counts.js');

const ev = (d, phase = 'review') => ({ date: new Date(`${d}T00:00:00Z`), phase, label: 'x' });
const cal = (ref, type, extra = {}) => ({
  uid: `${ref}-${type}-${extra.uid || ''}`, kind: 'application', municipality: 'Caledon', ref, fileKey: P.canonRef(ref), type,
  stage: /site plan/i.test(type) ? 'siteplan' : 'master', address: '1 TEST RD CALEDON ON', phase: 'review', statusRaw: 'Circulation',
  events: [ev('2022-03-01')], sourceName: 'test', ...extra,
});

test('fileId: a bare Caledon number carries its type; every other file is its canonical number', () => {
  assert.equal(P.fileId(cal('2022-0006', 'Official plan amendment')), 'POPA|2022|6');
  assert.equal(P.fileId(cal('2022-0006', 'Zoning by-law amendment')), 'RZ|2022|6');
  assert.equal(P.fileId(cal('2022-0006', 'Site plan')), 'SPA|2022|6');
  assert.equal(P.fileId(cal('2022-0006', 'Plan of condominium', { stage: 'condo' })), 'CONDO|2022|6', 'a type with no Town prefix carries its stage');
  assert.equal(P.fileId(cal('21T-22001', 'Plan of subdivision')), '21T|22001', 'a prefixed Caledon number is unchanged');
  assert.equal(P.fileId({ kind: 'permit', municipality: 'Caledon', ref: '2022-0006', fileKey: '2022|6' }), '2022|6', 'permits are unchanged');
  assert.equal(P.fileId({ kind: 'application', municipality: 'Brampton', ref: 'OZS-2022-0006', fileKey: 'OZS|2022|6' }), 'OZS|2022|6');
  assert.equal(P.fileId({ kind: 'application', municipality: 'Mississauga', ref: 'SP 22-6' }), 'SP|22|6', 'no fileKey: the canonical number');
  // The agenda spelling of the same file reads the same key (scripts/council-parse.js).
  assert.equal(P.fileId(cal('2026-0016', 'Zoning by-law amendment')), P.canonRef('RZ 2026-0016'));
});

test('dedupeRecords: Caledon files of different types with one number stay apart; one file\'s own records merge', () => {
  const opa = cal('2022-0006', 'Official plan amendment', { address: '100 FAR RD CALEDON ON' });
  const sp = cal('2022-0006', 'Site plan', { address: '200 NEAR RD CALEDON ON', units: 134 });
  const spAgain = cal('2022-0006', 'Site plan', { uid: 'b', address: '200 NEAR RD CALEDON ON', phase: 'approved', events: [ev('2023-01-01', 'approved')] });
  const out = P.dedupeRecords([opa, sp, spAgain]);
  assert.equal(out.length, 2, 'the OPA and the site plan are two files; the site plan\'s two records are one');
  const s = out.find(r => r.type === 'Site plan');
  assert.equal(s.units, 134); assert.equal(s.phase, 'approved'); assert.equal(s.events.length, 2);
  assert.equal(out.find(r => r.type === 'Official plan amendment').address, '100 FAR RD CALEDON ON', 'the OPA keeps its own land');
  // Elsewhere one number is one file, whatever the layer calls it.
  const a = { ...opa, municipality: 'Brampton', ref: 'OZS-2022-0006', fileKey: 'OZS|2022|6', uid: 'x1' };
  const b = { ...sp, municipality: 'Brampton', ref: 'OZS-2022-0006', fileKey: 'OZS|2022|6', uid: 'x2' };
  assert.equal(P.dedupeRecords([a, b]).length, 1);
});

test('the tree, its developments and their signatures key a Caledon file with its type', () => {
  const recs = [cal('2022-0006', 'Official plan amendment'), cal('2022-0006', 'Site plan', { units: 20 })];
  const nodes = T.fileNodes(recs);
  assert.deepEqual(nodes.map(n => n.id).sort(), ['Caledon|POPA|2022|6', 'Caledon|SPA|2022|6']);
  assert.ok(nodes.every(n => n.sharedNumber), 'both are marked as sharing a number');
  assert.equal(TG.fileKey(recs[1], P.canonRef), 'Caledon|SPA|2022|6', 'regroup looks files up by the same key');
  assert.deepEqual(TC.fileKeysOf({ records: recs }, P.canonRef), ['Caledon|POPA|2022|6', 'Caledon|SPA|2022|6']);
});

test('lookupOf: a count found online goes to the file of its type, never to each file sharing the number', () => {
  const recs = [cal('2021-0012', 'Zoning by-law amendment'), cal('2021-0012', 'Site plan'), cal('2019-0066', 'Site plan')];
  const nodes = T.fileNodes(recs);
  const of = id => nodes.find(n => n.id === id);
  const typed = new Map([['Caledon|RZ 2021-0012', { units: 127 }]]);
  assert.equal(T.lookupOf(of('Caledon|RZ|2021|12'), typed).units, 127);
  assert.equal(T.lookupOf(of('Caledon|SPA|2021|12'), typed), null, 'the site plan of the same number is another file');
  const bare = new Map([['Caledon|2021-0012', { units: 127 }], ['Caledon|2019-0066', { units: 0 }]]);
  assert.equal(T.lookupOf(of('Caledon|RZ|2021|12'), bare), null, 'a bare number two types share names no file');
  assert.equal(T.lookupOf(of('Caledon|SPA|2019|66'), bare).units, 0, 'a bare number only one file has is that file');
  const b = T.fileNodes([{ kind: 'application', municipality: 'Brampton', ref: 'OZS-2023-0040', fileKey: 'OZS|2023|40', uid: 'q', events: [] }])[0];
  assert.equal(T.lookupOf(b, new Map([['Brampton|OZS-2023-0040', { units: 5 }]])).units, 5, 'other municipalities as before');
});

test('normalizeAddress: a unit / suite / lot / block word is cut only as a whole word', () => {
  assert.equal(P.normalizeAddress('137 Steeles Ave W'), '137 STEELES AVE W');
  assert.equal(P.normalizeAddress('21 Steelwell Rd'), '21 STEELWELL RD');
  assert.notEqual(P.normalizeAddress('21 Steelwell Rd'), P.normalizeAddress('21 Stewardship Rd'), 'two streets, two sites');
  for (const a of ['45 Lotus Crt', '12 Unity Dr', '7 Blockhouse Rd', '8 Apted Cres']) assert.equal(P.normalizeAddress(a), a.toUpperCase(), a);
  assert.equal(P.normalizeAddress('55 Main St Unit 4'), '55 MAIN ST');
  assert.equal(P.normalizeAddress('100 Queen St Ste 200'), '100 QUEEN ST');
  assert.equal(P.normalizeAddress('100 Queen St Suite #12'), '100 QUEEN ST');
  assert.equal(P.normalizeAddress('1203-55 Main St'), '55 MAIN ST');
  assert.equal(P.normalizeAddress('9 Mill St Apt 3'), '9 MILL ST');
});

test('saved keys: an old address key resolves to the development now holding its records (both modes)', () => {
  // Synthetic: the old reading of "9 STEEPLE RD" cut the street ("9 RD"); today's key is the full address.
  const recs = [{ uid: 'a1', kind: 'application', municipality: 'Brampton', ref: 'SPA-1', fileKey: 'SPA|1', address: '9 STEEPLE RD', phase: 'review', events: [ev('2024-01-01')], type: 'Site plan', description: '' }];
  const ps = P.buildProjects(recs);
  const aliases = P.keyAliases(ps);
  const keys = new Set(ps.map(p => p.key)), exists = k => keys.has(k);
  const now = ps[0].key, old = `Brampton|${P.legacyNormalizeAddress('9 STEEPLE RD')}`;
  assert.equal(now, 'Brampton|9 STEEPLE RD'); assert.equal(old, 'Brampton|9 RD');
  TG.setData(null); TG.setAliases(aliases);
  assert.equal(TG.resolve(old, exists, { aliasesOnly: true }), now, 'Previous: the old key opens the development');
  assert.equal(TG.resolve(old, exists), now);
  assert.equal(TG.resolve(`${old}~SPA-1`, exists), now, 'an old tree key: its base');
  assert.equal(TG.resolve('Brampton|1 NOWHERE ST', exists, { aliasesOnly: true }), null, 'an unknown key stays unresolved');
  assert.deepEqual(TG.migrateKeys([old, 'Brampton|1 NOWHERE ST'], exists, { aliasesOnly: true }), [now, 'Brampton|1 NOWHERE ST'], 'nothing saved is dropped');
  const hist = { projects: { [old]: [['2024-01-01', 'review']] } };
  TG.translateHistory(hist, exists, { aliasesOnly: true });
  assert.deepEqual(hist.projects[now], [['2024-01-01', 'review']], 'the phase history follows');
  const ch = { moved: [{ key: old }] }; TG.translateChanges(ch, exists, { aliasesOnly: true });
  assert.equal(ch.moved[0].key, now); assert.equal(ch.moved[0].oldKey, old);
  TG.setAliases(() => P.keyAliases(ps));
  assert.equal(TG.resolve(old, exists), now, 'aliases worked out when first needed');
  TG.setAliases(null);
  assert.equal(TG.resolve(old, exists, { aliasesOnly: true }), null);
});
