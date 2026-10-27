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

test('the site sections are the map\u2019s five tabs, by their names; Servicing has the map\u2019s views', () => {
  const S = load({});
  assert.deepEqual(S.SITE.map(s => s.title), ['Overview', 'Growth', 'Servicing', 'Capital', 'Records']);
  assert.deepEqual(S.SITE.map(s => s.tab), ['overview', 'growth', 'svc', 'dca', 'records']);
  assert.deepEqual(S.SITE.map(s => s.id), ['summary', 'growth', 'servicing', 'capital', 'files'], 'the ids are kept (phase 1\u2019s routes, siteAt)');
  assert.deepEqual(S.BY_ID.servicing.views.map(v => [v.title, v.keys[0], v.page || '']), [['Network', 'svc:network', ''], ['FSR review', 'svc:fsr', 'fsr']]);
  assert.equal(S.BY_ID.fsr, undefined, 'FSR review is a Servicing view, not a section');
  // A view is its section with the view's keys: specFor draws FSR review's panel (the page fsr).
  const v = S.viewOf('servicing', 'fsr');
  assert.deepEqual([v.section, v.id, v.title, v.page, v.keys], ['servicing', 'fsr', 'FSR review', 'fsr', ['svc:fsr']]);
  assert.equal(S.viewOf('servicing', 'nope'), null); assert.equal(S.viewOf('growth', 'fsr'), null);
  const fsr = { answer: 'FSR review' }, S2 = load({ 'svc:fsr': { spec: fsr, scope: `dev:${p.key}` }, 'svc:network': { spec: { answer: 'Network' }, scope: `dev:${p.key}` } });
  assert.equal(S2.specFor(S2.viewOf('servicing', 'fsr'), p), fsr);
  assert.equal(S2.specFor('servicing', p).answer, 'Network', 'the section itself is its first view');
  assert.deepEqual(S.AREA.map(s => [s.title, s.page || s.keys[0]]), [['Growth', 'growth'], ['Forecast', 'outlook'], ['Servicing', 'svc:capacity'], ['Capital', 'dca:timing']]);
});

test('a panel the tab set for this development is used as is; one for another scope is not', () => {
  const mine = { answer: 'mine', lists: [] };
  let S = load({ 'growth:pipeline': { spec: mine, scope: `dev:${p.key}` } });
  assert.equal(S.specFor('growth', p), mine);
  S = load({ 'growth:pipeline': { spec: { answer: 'Peel' }, scope: 'area' } });
  assert.equal(S.specFor('growth', p), null, 'the area panel is not the site’s');
});

test('Capital and Records are built on demand; a section of two panels takes the first\u2019s answer and both lists', () => {
  const S = load({}, {
    dca: q => ({ answer: `relies on 5 (${q.title})`, figures: [{ v: 5 }], lists: [{ title: 'The projects it relies on', rows: [] }] }),
    eas: () => ({ answer: 'EAs', lists: [{ title: 'Near the site', rows: [] }], foot: { primary: { label: 'Show EAs' }, secondary: [{ label: 'Copy for review comments', attrs: { 'data-ce-copy-brief': '' } }] } }),
    files: () => ({ answer: '9 files', lists: [] }),
  });
  // (navigation phase 5: a site's Capital is one panel, DC timing's, which holds the EAs near it: js/dca-tab.js)
  assert.deepEqual(S.BY_ID.capital.keys, ['dca:timing']);
  const cap = S.specFor('capital', p);
  assert.equal(cap.answer, 'relies on 5 (1 Main St)');
  assert.deepEqual(cap.lists.map(l => l.title), ['The projects it relies on'], 'the dca builder\u2019s spec as is: no EAs panel merged');
  assert.equal(cap.foot, undefined);
  // The merge (general; no site section uses it now): the first's answer, both lists, the other's footer action.
  const two = S.specFor({ keys: ['dca:timing', 'dca:eas'] }, p);
  assert.equal(two.answer, 'relies on 5 (1 Main St)');
  assert.deepEqual(two.lists.map(l => l.title), ['The projects it relies on', 'Near the site']);
  assert.deepEqual(two.foot.secondary.map(b => b.label), ['Copy for review comments'], 'the second panel\u2019s action reaches the footer');
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
  assert.deepEqual(S.WORKSPACES.servicing.secs.map(s => s.title), ['Capacity', 'Network']);
  assert.deepEqual(S.WORKSPACES.capital.secs.map(s => s.title), ['DC timing', 'EAs', 'Projects']);
  assert.deepEqual(S.WORKSPACES.capital.secs.map(s => s.page || s.keys[0]), ['projects', 'eaflow', 'dca:projects'], 'EAs is EA to construction’s page (the EAs, then EA to construction; navigation phase 4)');
  assert.ok(!S.WORKSPACES.capital.secs.some(s => s.id === 'dcproj'), 'DC projects is DC timing (navigation phase 4)');
  assert.equal(S.WORKSPACES.servicing.host, 'tight'); assert.equal(S.WORKSPACES.capital.host, 'projects');
  assert.equal(S.wsSpecFor('servicing', 'network').answer, 'where it flows');
  assert.equal(S.wsSpecFor('servicing', 'capacity'), null, 'a page of its own, not a panel');
  globalThis.PeelCapitalEA = { projectsPanelSpec: () => ({ answer: '12 under construction' }) };
  assert.equal(S.wsSpecFor('capital', 'projects').answer, '12 under construction', 'built on demand');
});
