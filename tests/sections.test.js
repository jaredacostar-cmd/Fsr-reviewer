'use strict';
// js/sections.js: a page's sections are the full map's tab panels for its scope, built on demand when
// the tab hasn't built one; a section of two panels takes the first's answer and both panels' lists.
const test = require('node:test');
const assert = require('node:assert/strict');

function load(store, build = {}) {
  delete require.cache[require.resolve('../js/sections.js')];
  globalThis.PeelPanel = { get: k => store[k] || null };
  globalThis.PeelDcaTab = build.dca ? { siteSpec: build.dca } : undefined;
  globalThis.PeelCapitalEA = build.eas ? { easPanelSpec: build.eas } : undefined;
  globalThis.PeelRecordsTab = build.files ? { filesPanelSpec: build.files } : undefined;
  return require('../js/sections.js');
}
const p = { key: 'B|1 MAIN ST', title: '1 Main St' };

test('the site sections follow the map tabs, Summary first', () => {
  const S = load({});
  assert.deepEqual(S.SITE.map(s => s.title), ['Summary', 'Growth', 'Servicing', 'Capital', 'Files']);
  assert.deepEqual(S.SITE.map(s => s.tab), ['overview', 'growth', 'svc', 'dca', 'records']);
});

test('a panel the tab set for this development is used as is; one for another scope is not', () => {
  const mine = { answer: 'mine', lists: [] };
  let S = load({ 'growth:pipeline': { spec: mine, scope: `dev:${p.key}` } });
  assert.equal(S.specFor('growth', p), mine);
  S = load({ 'growth:pipeline': { spec: { answer: 'Peel' }, scope: 'area' } });
  assert.equal(S.specFor('growth', p), null, 'the area panel is not the site’s');
});

test('Capital and Files are built on demand; Capital adds the EAs’ lists under the timing', () => {
  const S = load({}, {
    dca: q => ({ answer: `relies on 5 (${q.title})`, figures: [{ v: 5 }], lists: [{ title: 'The projects it relies on', rows: [] }] }),
    eas: () => ({ answer: 'EAs', lists: [{ title: 'Near the site', rows: [] }] }),
    files: () => ({ answer: '9 files', lists: [] }),
  });
  const cap = S.specFor('capital', p);
  assert.equal(cap.answer, 'relies on 5 (1 Main St)');
  assert.deepEqual(cap.lists.map(l => l.title), ['The projects it relies on', 'Near the site']);
  assert.equal(S.specFor('files', p).answer, '9 files');
});

test('a section whose data is still loading is null (the page says it is loading)', () => {
  const S = load({}, { dca: () => null, eas: () => ({ lists: [] }) });
  assert.equal(S.specFor('capital', p), null);
  assert.equal(S.specFor('nope', p), null);
});
