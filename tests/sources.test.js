'use strict';
// Every data file has a receipt (data/sources.json): where it comes from, when, and the script that
// builds it. A new data file with no entry, a source with no link, or a date that can't be read
// fails here, so every figure in the app stays checkable against its source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../js/sources.js');

const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const reg = JSON.parse(src('data/sources.json'));
const entries = Object.entries(reg.files);
// Files the deploy writes about the others (not data the app counts from).
const SELF = new Set(['sources.json', 'sources-index.json']);
const readJSON = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

test('every file and folder in data/ has a receipt in data/sources.json', () => {
  const missing = [];
  for (const e of fs.readdirSync(DATA, { withFileTypes: true })) {
    const key = e.isDirectory() ? `${e.name}/` : e.name;
    if (SELF.has(key) || e.name.startsWith('.')) continue;
    if (!reg.files[key]) missing.push(key);
  }
  assert.deepEqual(missing, [], `add an entry to data/sources.json for: ${missing.join(', ')}`);
});

test('every receipt names a file that exists, a kind and a title', () => {
  for (const [k, e] of entries) {
    assert.ok(e.optional || fs.existsSync(path.join(DATA, k)), `${k}: no such file`);
    assert.ok(S.KIND[e.kind], `${k}: kind ${e.kind}`);
    assert.ok(e.title && e.title.length > 3, `${k}: title`);
  }
});

test('published data names where it comes from: a link, or a link on each item', () => {
  for (const [k, e] of entries) {
    if (e.kind !== 'open-data' && e.kind !== 'document') continue;
    assert.ok(e.publisher, `${k}: publisher`);
    assert.ok((e.links && e.links.length) || e.linksFrom || e.itemLinks, `${k}: no link to its source`);
  }
});

test('built and corrected data names the files it is built from', () => {
  const under = f => entries.some(([k]) => k.endsWith('/') && f.startsWith(k));
  for (const [k, e] of entries) {
    if (e.kind !== 'derived' && e.kind !== 'decision') continue;
    assert.ok(e.from && e.from.length, `${k}: from`);
    for (const f of e.from) assert.ok(reg.files[f] || under(f), `${k}: from ${f} has no receipt`);
  }
});

test('every link is a full https address; every script named exists', () => {
  for (const [k, e] of entries) {
    for (const l of e.links || []) {
      assert.ok(l.label, `${k}: link label`);
      assert.doesNotThrow(() => new URL(l.url), `${k}: ${l.url}`);
      assert.match(l.url, /^https:\/\//, `${k}: ${l.url}`);
    }
    if (e.script) assert.ok(fs.existsSync(path.join(ROOT, e.script)), `${k}: ${e.script}`);
  }
});

test('every file says when: its dateField reads a date from the file, or a published date or a note', () => {
  for (const [k, e] of entries) {
    if (e.dateField) {
      if (k.endsWith('/')) {
        const [f, field] = e.dateField.split(':');
        assert.ok(S.dateOf(readJSON(`${k}${f}`), field), `${k}: ${e.dateField}`);
      } else if (fs.existsSync(path.join(DATA, k))) {
        assert.ok(S.dateOf(readJSON(k), e.dateField), `${k}: ${e.dateField} is not a date in the file`);
      }
    } else {
      assert.ok(/^\d{4}(-\d{2}){0,2}$/.test(e.published || '') || e.dateNote, `${k}: no date`);
    }
  }
});

test('the snapshot: every layer it reads has its address, so each record links to its feature', () => {
  const snap = readJSON('snapshot.json');
  assert.equal(reg.files['snapshot.json'].linksFrom, 'sources');
  assert.ok(snap.sources.length >= 10);
  for (const s of snap.sources) assert.match(s.url || '', /^https:\/\/.+\/(FeatureServer|MapServer)(\/\d+)?$/, s.id);
});

test('item-level receipts: each plan target has its link, page, date and quote', () => {
  const T = readJSON('plan-targets.json');
  for (const t of T.targets) {
    assert.match(t.url || '', /^https?:\/\//, `${t.id}: url`);
    for (const k of ['source', 'page', 'quote']) assert.ok(t[k], `${t.id}: ${k}`);
  }
  // Known gap: the Caledon news release for Mayfield West Phase 2 carries no date. Any other undated
  // target fails here.
  assert.deepEqual(T.targets.filter(t => !t.date).map(t => t.id), ['sp:caledon:mayfield-west-phase-2-']);
});

test('dateOf reads a dotted path and keeps the day of an ISO time', () => {
  assert.equal(S.dateOf({ generatedAt: '2026-10-19T10:45:08.495Z' }, 'generatedAt'), '2026-10-19');
  assert.equal(S.dateOf({ source: { latestLastUpdate: '2026-04-13' } }, 'source.latestLastUpdate'), '2026-04-13');
  assert.equal(S.dateOf({ year: 2025 }, 'year'), '2025');
  assert.equal(S.dateOf({ x: 'soon' }, 'x'), null);
  assert.equal(S.dateOf(null, 'x'), null);
});

test('rows and the citation: links, the date and the fingerprint the app holds', () => {
  const index = { generatedAt: '2026-10-21T00:00:00Z', files: { 'sewers.json': { asOf: '2026-10-13', sha256: 'ab'.repeat(32), bytes: 10 }, 'snapshot.json': { asOf: '2026-10-19', links: [{ label: 'Mississauga – permits', url: 'https://example.org/FeatureServer/0' }] } } };
  const rs = S.rows(reg, index), sew = rs.find(r => r.file === 'sewers.json'), snap = rs.find(r => r.file === 'snapshot.json');
  assert.equal(rs.length, entries.length);
  const c = S.citation(sew);
  assert.match(c, /^Region of Peel, Sanitary sewer network/);
  assert.match(c, /waterwastWater\/FeatureServer\/10/);
  assert.match(c, /pulled 2026-10-13/);
  assert.match(c, new RegExp(`data/sewers\\.json \\(SHA-256 ${'ab'.repeat(32)}\\)`));
  assert.equal(snap.links[0].url, 'https://example.org/FeatureServer/0', 'the snapshot layers come from the index');
  const dc = rs.find(r => r.file === 'dc-costs.json');
  assert.equal(dc.asOf, '2020-09-18');
  assert.match(S.citation(dc), /published 2020-09-18/);
  const h = S.tableHTML(rs, index);
  assert.match(h, /data-src-cite="sewers\.json"/);
  assert.match(h, /<code title="SHA-256 of data\/sewers\.json">abababababab<\/code>/);
  assert.doesNotMatch(S.tableHTML(S.rows(reg, null), null), /SHA-256 of/, 'no index: no fingerprints, still every source');
});

test('the index is built at deploy, not committed; the page loads the module and shows the table', () => {
  assert.match(src('.gitignore'), /^data\/sources-index\.json$/m);
  const wf = src('.github/workflows/site.yml');
  assert.ok(wf.indexOf('node scripts/build-sources-index.js') > 0 && wf.indexOf('node scripts/build-sources-index.js') < wf.indexOf('Public build'), 'built before the public build');
  assert.match(src('index.html'), /<script src="js\/sources\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('js/demand-ui.js'), /PeelSources\.slotHTML\(\)/);
  assert.match(src('js/records-tab.js'), /PeelSources\.slotHTML\(\)/);
});
