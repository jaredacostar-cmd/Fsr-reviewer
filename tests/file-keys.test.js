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

test('normalizeAddress: a town, province and postal code without commas go too (Caledon planning files)', () => {
  const permit = P.normalizeAddress('48 Sample Road, Caledon, ON, L7C 0A0');
  assert.equal(P.normalizeAddress('48 SAMPLE ROAD CALEDON ON L7C 0A0'), permit, 'an application and a permit at one address meet');
  assert.equal(P.normalizeAddress('1 SAMPLE DRIVE CALEDON ON'), '1 SAMPLE DR');
  assert.equal(P.normalizeAddress('2 SAMPLE STREET CALEDON EAST ON L7K 0A0'), '2 SAMPLE ST');
  assert.equal(P.normalizeAddress('3 SAMPLE WAY UNIT 4 CALEDON ON L7C 0A0'), '3 SAMPLE WAY');
  assert.equal(P.normalizeAddress('4 SAMPLE ST L7E 0A0'), '4 SAMPLE ST', 'a trailing postal code');
  assert.equal(P.normalizeAddress('18000 MISSISSAUGA ROAD CALEDON ON L7K 0A0'), '18000 MISSISSAUGA RD', 'Mississauga Road is a street');
  assert.equal(P.normalizeAddress('5 MAIN ST BRAMPTON ON L6X 0A0'), '5 MAIN ST');
  // The old key of such a development still opens it.
  const recs = [{ uid: 'c1', kind: 'application', municipality: 'Caledon', ref: '2024-0001', fileKey: '2024|1', type: 'Site plan', stage: 'siteplan', address: '48 SAMPLE ROAD CALEDON ON L7C 0A0', phase: 'review', events: [ev('2024-01-01')], description: '' }];
  const ps = P.buildProjects(recs), keys = new Set(ps.map(p => p.key));
  assert.equal(ps[0].key, 'Caledon|48 SAMPLE RD');
  TG.setData(null); TG.setAliases(P.keyAliases(ps));
  assert.equal(TG.resolve('Caledon|48 SAMPLE RD CALEDON ON L7C 0A0', k => keys.has(k), { aliasesOnly: true }), 'Caledon|48 SAMPLE RD');
  TG.setAliases(null);
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

test('dedupeRecords: one Mississauga permit in both permit feeds is one permit (ARU / SU suffix), with the larger unit count', () => {
  const mp = (ref, units, sourceId, fileKey = P.canonRef(ref)) => ({ uid: `${sourceId}:${ref}:${units}`, kind: 'permit', municipality: 'Mississauga', ref, fileKey, units,
    sourceId, sourceName: sourceId, address: '5907 SAIGON ST', phase: 'permit', statusRaw: 'ISSUED PERMIT', events: [ev('2024-10-31', 'permit')] });
  assert.equal(P.canonRef('SEC UNIT 24-3708 ARU'), P.canonRef('SEC UNIT 24 3708'));
  assert.equal(P.canonRef('SEC UNIT 23-5463 SU'), P.canonRef('SEC UNIT 23 5463'));
  // A snapshot built before the suffix rule keeps "…|ARU" in its stored fileKey: still one permit.
  const out = P.dedupeRecords([mp('BP 9NEW 24 4075', 2, 'mis-gm-permits/0'), mp('BP 9NEW 24 4075', 8, 'mis-gm-permits/0'), mp('BP 9NEW 24-4075 ARU', 10, 'mis-permits/0', 'BP|9NEW|24|4075|ARU')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].units, 10, 'the feed that states the whole permit wins, whichever loaded first');
  const su = P.dedupeRecords([mp('SEC UNIT 23-5463 SU', 1, 'mis-permits/0', 'SEC|UNIT|23|5463|SU'), mp('SEC UNIT 23 5463', 1, 'mis-gm-permits/0')]);
  assert.deepEqual(su.map(r => r.units), [1]);
});

test('displayAddress: the municipality, province and postal code the source appends are dropped from a title', () => {
  assert.equal(P.displayAddress('14 Twilley Rd, Brampton, ON,'), '14 Twilley Rd');
  assert.equal(P.displayAddress('31 Banks Dr, Brampton, ON, L6P 1A5'), '31 Banks Dr');
  assert.equal(P.displayAddress('12290 HUTCHINSON FARM LANE CALEDON ON L7C 2B6'), '12290 HUTCHINSON FARM LANE');
  assert.equal(P.displayAddress('40 DOLYBHILL DRIVE, BRAMPTON'), '40 DOLYBHILL DRIVE');
  // a street named after a municipality, or "Ontario" inside a street name, stays
  for (const a of ['NORTHWEST CORNER OF EDGEWARE ROAD & MISSISSAUGA', '2 MARITIME ONTARIO BLVD', '0 BOVAIRD DR W', '100 Queen St W, Unit 5']) assert.equal(P.displayAddress(a), a, a);
});
