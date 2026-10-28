'use strict';
// js/sections.js: a page's sections are the full map's tab panels for its scope, built on demand when
// the tab hasn't built one; a section of two panels takes the first's answer and both panels' lists. A page
// host's views (navigation phase 6: Home at an area) are the map's tabs and chips, by tab:sub.
const test = require('node:test');
const assert = require('node:assert/strict');
const plain = o => JSON.parse(JSON.stringify(o));

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
});

// (navigation phase 6, §5 row 50: the AREA bar, Growth in an area's Growth · Forecast · Servicing · Capital, is
// removed by design; an area's views are Home's tabs and chips, the map's own)
test('an area\u2019s views: the map\u2019s tabs and chips by tab:sub, a page builder where a page adds to the panel, else the panel', () => {
  const S = load({});
  assert.equal(S.AREA, undefined);
  assert.deepEqual(Object.keys(S.VIEWS.area), ['overview:', 'growth:pipeline', 'growth:areas', 'growth:timing', 'svc:capacity', 'svc:network', 'dca:timing', 'dca:eas', 'dca:projects', 'records:sources', 'records:checks']);
  assert.deepEqual(Object.entries(S.VIEWS.area).map(([k, v]) => [k, v.page || v.keys[0], v.ws || '']), [['overview:', 'home', ''], ['growth:pipeline', 'growth:pipeline', 'growth'], ['growth:areas', 'growth', ''], ['growth:timing', 'outlook', ''], ['svc:capacity', 'tight', ''], ['svc:network', 'svc:network', 'tight'], ['dca:timing', 'projects', ''], ['dca:eas', 'eaflow', ''], ['dca:projects', 'dca:projects', 'projects'], ['records:sources', 'data', ''], ['records:checks', 'records:checks', '']]);
  for (const v of Object.values(S.VIEWS.area)) assert.ok(!!v.page !== !!v.keys, 'a page builder or a panel, never both');
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

// (navigation phase 6: areaSpecFor, Growth in an area's Servicing and Capital sections, went with the AREA bar;
// the views read areaPanel, the same panel)
test('an area\u2019s view panel: the one its tab set for the area, else built here (Capital built on demand)', () => {
  const cap = { answer: 'Peel capacity' };
  let S = load({ 'svc:capacity': { spec: cap, scope: 'area' } });
  assert.equal(S.areaSpecFor, undefined);
  assert.equal(S.areaPanel('svc:capacity'), cap);
  assert.equal(S.areaPanel('dca:timing'), null, 'Capital: not built yet, no builder');
  globalThis.PeelDcaTab = { areaSpec: () => ({ answer: '1 late' }) };
  assert.equal(S.areaPanel('dca:timing').answer, '1 late');
  S = load({ 'svc:capacity': { spec: cap, scope: 'dev:x' } });
  assert.equal(S.areaPanel('svc:capacity'), null, 'a site\u2019s panel is not the area\u2019s');
});

// (navigation phase 6, §5 rows 51–52: the Servicing and Capital workspace bars are removed by design; their
// sections are the strip's views of Home: Servicing › Capacity · Network, Capital › DC timing · EAs · Projects)
test('Servicing and Capital: the map’s sub-views of the tab are Home’s views; a panel view is the map’s panel', () => {
  const S = load({ 'svc:network': { spec: { answer: 'where it flows' }, scope: 'area' } });
  assert.equal(S.WORKSPACES.servicing, undefined); assert.equal(S.WORKSPACES.capital, undefined); assert.equal(S.wsSpecFor, undefined);
  assert.deepEqual(plain(S.VIEWS.area['svc:network']), { keys: ['svc:network'], ws: 'tight' }, 'Network: the panel, its map view Servicing capacity’s');
  assert.deepEqual(plain(S.VIEWS.area['dca:projects']), { keys: ['dca:projects'], ws: 'projects' });
  assert.deepEqual(['dca:timing', 'dca:eas'].map(k => S.VIEWS.area[k].page), ['projects', 'eaflow'], 'DC timing and EAs: their pages (a project in place; the EAs, then EA to construction)');
  assert.ok(!Object.keys(S.VIEWS.area).includes('dca:dcproj'), 'DC projects is DC timing (navigation phase 4)');
  assert.equal(S.areaPanel('svc:network').answer, 'where it flows');
  assert.equal(S.areaPanel('svc:capacity'), null, 'not set: the page builder reads it when it is');
  globalThis.PeelCapitalEA = { projectsPanelSpec: () => ({ answer: '12 under construction' }) };
  assert.equal(S.areaPanel('dca:projects').answer, '12 under construction', 'built on demand');
});
