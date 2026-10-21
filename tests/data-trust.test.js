'use strict';
// Counts that hold still: data files tied to their build, the tree counts waited for (a failed load
// says so), and every count found online checked against its page (data/unit-lookups.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const U = require('../js/util.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('data/*.json requests carry the build, so a cached file from the previous build never answers the new code', () => {
  assert.equal(U.versionedDataURL('data/snapshot.json', 'abc1234'), 'data/snapshot.json?v=abc1234');
  assert.equal(U.versionedDataURL('./data/tree-counts.json', 'abc1234'), './data/tree-counts.json?v=abc1234');
  assert.equal(U.versionedDataURL('data/constraints/nhs/index.json', 'b'), 'data/constraints/nhs/index.json?v=b');
  assert.equal(U.versionedDataURL('data/snapshot.json', null), 'data/snapshot.json', 'locally (no build stamp) unchanged');
  assert.equal(U.versionedDataURL('data/x.json?y=1', 'b'), 'data/x.json?y=1', 'a URL with its own query is left alone');
  assert.equal(U.versionedDataURL('https://example.org/data/x.json', 'b'), 'https://example.org/data/x.json', 'other sites untouched');
  assert.equal(U.versionedDataURL('js/app.js', 'b'), 'js/app.js');
  assert.match(src('index.html'), /<meta name="app-version" content="__BUILD__">/);
  assert.match(src('.github/workflows/site.yml'), /sed -i "s\/__BUILD__\/\$\{v\}\/g" index\.html sw\.js/);
});

test('the tree counts are waited for, not dropped after 3 s; a failed load is shown beside the count', () => {
  const app = src('js/app.js');
  assert.doesNotMatch(app, /setTimeout\(r, 3000\)/);
  assert.match(app, /Promise\.race\(\[treeCountsLoad, new Promise\(r => setTimeout\(r, 20000\)\)\]\)/);
  const TC = require('../js/tree-counts.js');
  assert.equal(TC.status, 'idle');
  assert.match(src('js/topbar.js'), /TC\.status === 'failed'[\s\S]*tb-count-warn[\s\S]*data-tb-reload/);
});

test('counts found online: each with a link was checked against its page; unconfirmed ones are not used', () => {
  const L = JSON.parse(src('data/unit-lookups.json'));
  const linked = Object.entries(L.files).filter(([, e]) => e.url && e.units > 0);
  assert.ok(linked.length >= 20);
  for (const [k, e] of linked) {
    assert.ok(e.verified && /^\d{4}-\d{2}-\d{2}$/.test(e.verified.on), `${k}: checked`);
    assert.ok(['municipal', 'other'].includes(e.verified.by), `${k}: how`);
  }
  // A count with no link is the file's own wording, never an unsourced number.
  for (const [k, e] of Object.entries(L.files)) if (!e.url && e.units > 0) assert.match(e.source, /the file's own wording/, k);
  const dropped = new Map(L.notUsed.map(n => [n.key, n]));
  for (const k of ['Brampton|OZS-2022-0046', 'Brampton|PRE-2021-0141', 'Brampton|C02E05.036']) {
    assert.ok(!L.files[k], `${k} not used`); assert.match(dropped.get(k).why, /^source checked \d{4}-\d{2}-\d{2}: /);
  }
  // The tree build labels each checked count in the source shown beside it.
  assert.match(src('scripts/audit-tree.js'), /the municipal notice for this file states it/);
});
