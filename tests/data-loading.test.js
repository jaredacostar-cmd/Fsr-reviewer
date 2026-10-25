'use strict';
// Data loading: one request per file, no request for files that are never published.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('a data file read by two modules is asked for once and parsed once (history, capital)', async () => {
  const U = require('../js/util.js');
  const real = globalThis.fetch; let n = 0;
  globalThis.fetch = async () => { n++; return { ok: true, json: async () => ({ projects: { a: [] } }) }; };
  try {
    const [a, b] = await Promise.all([U.dataJSON('data/x-test.json'), U.dataJSON('data/x-test.json')]);
    assert.equal(n, 1); assert.equal(a, b);
    globalThis.fetch = async () => { n++; return { ok: false }; };
    const [m1, m2] = await Promise.all([U.dataJSON('data/missing-test.json'), U.dataJSON('data/missing-test.json')]);
    assert.equal(m1, null); assert.equal(m2, null);
    assert.equal(n, 2, 'callers at the same time share the one request');
    assert.equal(await U.dataJSON('data/missing-test.json'), null);
    assert.equal(n, 3, 'a failed load is asked for again by a later caller');
  } finally { globalThis.fetch = real; }
  assert.match(src('js/accuracy.js'), /U\.dataJSON\('data\/history\.json'\)/);
  const app = src('js/app.js');
  assert.doesNotMatch(app, /fetch\('data\/history\.json'/);
  assert.match(app, /PeelUtil\.dataJSON\('data\/history\.json'\)\.then\(h => \{\n\s+if \(h && h\.projects\) h = \{ \.\.\.h, projects: \{ \.\.\.h\.projects \} \};/, 'the tree keys go on the app\'s copy, not the shared one');
  assert.match(src('js/capital-ea.js'), /U\.dataJSON\('data\/capital\.json'\)/);
  assert.match(src('js/dc-joins.js'), /U\.dataJSON\('data\/capital\.json'\)/);
});

test('the accuracy report reads history.json as published: the app adds tree keys to its own copy', () => {
  const TG = require('../js/tree-groups.js');
  const shared = { projects: { 'Brampton|x': [['2026-10-08', 'approved'], ['2026-10-15', 'construction']] } };
  const mine = { ...shared, projects: { ...shared.projects } };
  TG.translateHistory(mine, () => true, { aliasesOnly: false });
  assert.deepEqual(Object.keys(shared.projects), ['Brampton|x']);
});

test('the startup index is asked for only when the weekly commit publishes it', () => {
  const app = src('js/app.js'), site = src('.github/workflows/site.yml');
  const add = site.split('\n').find(l => /git add data\/snapshot\.json/.test(l));
  const on = /const STARTUP_INDEX = true;/.test(app);
  assert.ok(on || /const STARTUP_INDEX = false;/.test(app));
  assert.equal(on, add.includes('data/snapshot-index.json'), 'STARTUP_INDEX follows the commit list');
  const build = site.split('\n').find(l => /node scripts\/build-snapshot\.js/.test(l));
  assert.equal(/--index\b/.test(build), on, 'the weekly build writes the index only when it is published');
  assert.match(src('scripts/build-snapshot.js'), /if \(withIndex\) fs\.writeFileSync\(idxFile/);
  assert.match(app, /if \(!STARTUP_INDEX \|\| !SI\) return false;\n\s+const res = await fetch\('data\/snapshot-index\.json'/);
});

test('alerts: a missing feed is asked for once, not again on every ☆ Watch', async () => {
  const realFetch = globalThis.fetch, realDoc = globalThis.document;
  let n = 0; const handlers = [];
  globalThis.fetch = async () => { n++; return { ok: false, json: async () => null }; };
  globalThis.document = { readyState: 'complete', getElementById: () => null, addEventListener: (t, h) => handlers.push([t, h]) };
  try {
    delete require.cache[require.resolve('../js/alerts.js')];
    require('../js/alerts.js');
    await new Promise(r => setTimeout(r, 20));
    for (let i = 0; i < 3; i++) {
      handlers.filter(([t]) => t === 'click').forEach(([, h]) => h({ target: { closest: s => (s === '[data-watch]' ? {} : null) } }));
      await new Promise(r => setTimeout(r, 120));
    }
    assert.equal(n, 1);
  } finally {
    globalThis.fetch = realFetch;
    if (realDoc === undefined) delete globalThis.document; else globalThis.document = realDoc;
    delete require.cache[require.resolve('../js/alerts.js')];
  }
});

test('the service worker\'s data rule: top-level data files stale-while-revalidate, sub-folders cache-first (said in its comments)', () => {
  const sw = src('sw.js');
  const re = eval(sw.match(/const DATA_URL_RE = (\/.*\/);/)[1]);
  assert.ok(re.test('/x/data/snapshot.json?v=b'));
  assert.ok(!re.test('/x/data/constraints/orm/1_2.json?v=b'));
  assert.doesNotMatch(sw, /~19 per-topic|~26\.5MB/);
  assert.match(sw, /data\/constraints\/ tiles, data\/ledger\//);
});
