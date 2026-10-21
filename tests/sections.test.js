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
  assert.deepEqual(S.SITE.map(s => s.title), ['Summary', 'Growth', 'Servicing', 'Capital', 'Files', 'FSR review']);
  assert.deepEqual(S.SITE.map(s => s.tab), ['overview', 'growth', 'svc', 'dca', 'records', 'svc']);
  assert.equal(S.BY_ID.fsr.page, 'fsr', 'the FSR review is a page of its own');
  assert.deepEqual(S.AREA.map(s => [s.title, s.page || s.keys[0]]), [['Growth', 'growth'], ['Forecast', 'outlook'], ['Servicing', 'svc:capacity'], ['Capital', 'dca:timing']]);
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
    eas: () => ({ answer: 'EAs', lists: [{ title: 'Near the site', rows: [] }], foot: { primary: { label: 'Show EAs' }, secondary: [{ label: 'Copy for review comments', attrs: { 'data-ce-copy-brief': '' } }] } }),
    files: () => ({ answer: '9 files', lists: [] }),
  });
  const cap = S.specFor('capital', p);
  assert.equal(cap.answer, 'relies on 5 (1 Main St)');
  assert.deepEqual(cap.lists.map(l => l.title), ['The projects it relies on', 'Near the site']);
  assert.deepEqual(cap.foot.secondary.map(b => b.label), ['Copy for review comments'], 'the EAs panel\u2019s action reaches the footer');
  assert.equal(S.specFor('files', p).answer, '9 files');
});

test('a section whose data is still loading is null (the page says it is loading)', () => {
  const S = load({}, { dca: () => null, eas: () => ({ lists: [] }) });
  assert.equal(S.specFor('capital', p), null);
  assert.equal(S.specFor('nope', p), null);
});

test('an area\u2019s Servicing and Capital: the map\u2019s area panels (Capital built on demand)', () => {
  const cap = { answer: 'Peel capacity' };
  let S = load({ 'svc:capacity': { spec: cap, scope: 'area' } });
  assert.equal(S.areaSpecFor('servicing'), cap);
  assert.equal(S.areaSpecFor('capital'), null, 'Capital: not built yet, no builder');
  globalThis.PeelDcaTab = { areaSpec: () => ({ answer: '1 late' }) };
  assert.equal(S.areaSpecFor('capital').answer, '1 late');
  S = load({ 'svc:capacity': { spec: cap, scope: 'dev:x' } });
  assert.equal(S.areaSpecFor('servicing'), null, 'a site\u2019s panel is not the area\u2019s');
});

test('Servicing and Capital: a page, and the map’s other sub-views of the tab as sections', () => {
  const S = load({ 'svc:network': { spec: { answer: 'where it flows' }, scope: 'area' } });
  assert.deepEqual(S.WORKSPACES.servicing.secs.map(s => s.title), ['Capacity', 'Network', 'Allocations', 'Model checks']);
  assert.deepEqual(S.WORKSPACES.capital.secs.map(s => s.title), ['DC timing', 'EA to construction', 'Projects', 'EAs']);
  assert.equal(S.WORKSPACES.servicing.host, 'tight'); assert.equal(S.WORKSPACES.capital.host, 'projects');
  assert.equal(S.wsSpecFor('servicing', 'network').answer, 'where it flows');
  assert.equal(S.wsSpecFor('servicing', 'capacity'), null, 'a page of its own, not a panel');
  globalThis.PeelCapitalEA = { projectsPanelSpec: () => ({ answer: '12 under construction' }) };
  assert.equal(S.wsSpecFor('capital', 'projects').answer, '12 under construction', 'built on demand');
});
