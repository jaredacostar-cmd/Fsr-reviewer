'use strict';
// The published data (data/*.json) holds no one's name, contact or staff note, and the build
// scripts keep it so (js/privacy.js; the scrub itself is tested in tests/privacy.test.js). Every
// failure message gives counts only: the tests never print what they found.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const P = require('../js/privacy.js');

// ---- The stored data -----------------------------------------------------------------------
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?1[ .-]?)?(?:\(\d{3}\)\s?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b/;
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach(x => strings(x, out)); else if (o && typeof o === 'object') for (const v of Object.values(o)) strings(v, out); return out; };

test('the published data holds no e-mail address and no phone number', () => {
  for (const f of ['snapshot.json', 'council.json', 'fsr.json', 'eas.json', 'tree-audit.json', 'unit-lookups.json', 'tree-counts.json']) {
    const file = path.join(__dirname, '..', 'data', f);
    if (!fs.existsSync(file)) continue;
    // URLs carry long digit runs (document ids) that are not phone numbers.
    const all = strings(JSON.parse(fs.readFileSync(file, 'utf8'))).filter(s => !/^https?:\/\//.test(s));
    const emails = all.filter(s => EMAIL.test(s)), phones = all.filter(s => PHONE.test(s));
    assert.equal(emails.length, 0, `${f}: ${emails.length} strings with an e-mail address`);
    assert.equal(phones.length, 0, `${f}: ${phones.length} strings with a phone number`);
  }
});

test('the stored council data names no one, and the build keeps it so', () => {
  const c = JSON.parse(src('data/council.json'));
  const left = [], given = [];
  for (const m of Object.values(c.meetings)) for (const it of m.items) {
    for (const s of [it.title, it.text]) { if (P.hasPeople(s)) left.push('text'); if (P.givenNameHits(s).length) given.push('text'); }
    for (const [, n] of it.docs || []) { if (P.docName(n) !== n) left.push('doc'); if (P.givenNameHits(n).length) given.push('doc'); }
  }
  // Counts only: the message never prints what was found.
  assert.equal(left.length, 0, `${left.length} council strings still change when scrubbed`);
  // The given-name backstop (js/privacy.js givenNameHits) skips streets, facilities and firms
  // ("Glen Erin Drive", "Jane Doe & Associates"): nothing else may be left.
  assert.equal(given.length, 0, `${given.length} council strings with a given name and a surname`);
  assert.match(src('scripts/build-council.js'), /require\('\.\.\/js\/privacy\.js'\)\.scrubCouncil\(out\);\n {2}fs\.writeFileSync\(path\.join\(OUT, 'council\.json'\)/);
});

test('stored descriptions and copies of them are scrubbed, and every build scrubs them', () => {
  const s = JSON.parse(src('data/snapshot.json'));
  const left = s.records.filter(r => r.description && P.scrubDescription(r.description, r) !== r.description).length;
  assert.equal(left, 0, `${left} snapshot descriptions still change when scrubbed`);
  const t = JSON.parse(src('data/tree-audit.json'));
  const copies = ((t.growthNoCount && t.growthNoCount.toFind) || []).concat(((t.planAmendments && t.planAmendments.byDevelopment) || []).map(x => x.latest || {}));
  assert.equal(copies.filter(x => x.description && P.scrubDescription(x.description) !== x.description).length, 0);
  const e = JSON.parse(src('data/eas.json'));
  assert.equal(e.eas.flatMap(x => (x.links && x.links.appendices) || []).filter(a => P.isContactList(a.label)).length, 0);
  const f = JSON.parse(src('data/fsr.json'));
  assert.equal(f.items.filter(i => i.fsr && P.fsrTitle(i.fsr.title) !== i.fsr.title).length, 0);
  // The builds: snapshot records (and the live path), the FSR titles, EA appendices, the tree audit.
  assert.match(src('scripts/build-snapshot.js'), /k === 'description' \? PV\.scrubDescription\(r\[k\], r\)/);
  assert.match(src('js/phases.js'), /rec\.description = PV\.scrubDescription\(rec\.description, rec\);\n\s+rec\.props = PV\.safeProps\(p, \[fmap\.description, fmap\.proposal\]\);/);
  assert.match(src('scripts/build-fsr.js'), /title: PV\.fsrTitle\(/);
  assert.match(src('scripts/ea-lib.js'), /if \(PV\.isContactList\(label\)\) continue;/);
  assert.match(src('scripts/build-eas.js'), /e\.links\.appendices\.filter\(a => !PV\.isContactList\(a\.label\)\)/);
  assert.match(src('scripts/audit-tree.js'), /description: PV\.scrubDescription\(/);
  // The browser loads the scrub before the records are read.
  const html = src('index.html');
  assert.ok(html.indexOf('js/privacy.js') > 0 && html.indexOf('js/privacy.js') < html.indexOf('js/phases.js'));
  assert.match(src('sw.js'), /'js\/privacy\.js'/);
});
