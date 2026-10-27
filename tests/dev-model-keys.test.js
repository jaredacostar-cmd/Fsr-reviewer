'use strict';
// Development keys, the latest file, and files opened on their own (verification pins for DM-05/06/02).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const P = require('../js/phases.js');
const H = require('./helpers/real-devs.js');
const { siteTest } = require('./helpers/site-check.js');

// js/dev-nav.js in node: the app's globals it reads at load, stubbed.
function devNav(projects) {
  Object.assign(globalThis, { window: globalThis, PeelPhases: P, PeelTreeGroups: require('../js/tree-groups.js'),
    PeelApp: { state: { projects, treeGrouped: true } }, PeelUtil: { $: () => null, esc: x => x, fmtNum: x => x, store: {}, dot: () => '' },
    PeelMapCore: { map: {} }, document: { addEventListener() {} } });
  delete require.cache[require.resolve('../js/dev-nav.js')];
  return require('../js/dev-nav.js');
}

test('every development opens by its key, a land split ("<key>#1") too; a branch key still opens the file on its own', { skip: !H.available() }, () => {
  const { projects } = H.realDevs();
  const N = devNav(projects);
  const bad = projects.filter(p => N.projectByKey(p.key) !== p).map(p => p.key);
  assert.deepEqual(bad, []);
  const gore = projects.find(p => p.key === 'Caledon|14275 THE GORE RD#1');
  assert.ok(gore, 'the README example (21T-22002C) is a land split');
  const sub = N.projectByKey(`${gore.key}#21T-22002C`);
  assert.ok(sub && sub.parent === gore, 'its file opens on its own under it');
  assert.match(src('js/dev-nav.js'), /const own = find\(k\); if \(own\) return own;\n {4}const i = String\(k\)\.lastIndexOf\('#'\)/);
  // (one copy, navigation phase 5, M3: Records' full table finds a development by key through js/dev-nav.js)
  assert.doesNotMatch(src('js/devtab.js'), /function projectByKey\(|function subProject\(|const SUBS = new Map/, 'one copy: js/dev-nav.js (M3)');
  assert.match(src('js/devtab.js'), /const projectByKey = k => \(k && state\(\) \? N\(\)\.projectByKey\(k\) : null\);/);
});

test('opening a file on its own leaves its development\'s permit placement as built', { skip: !H.available() }, () => {
  const { projects } = H.realDevs();
  const N = devNav(projects), TG = require('../js/tree-groups.js'), D = require('../js/demand.js');
  const flags = p => p.records.map(r => [r.uid, r.fileOf, r.prePlan, r.prePlanKept, r.outside, r.superseded, r.closedUnconfirmed].join(',')).join(';');
  const devs = projects.filter(p => { const rows = TG.fileRows(p); return rows && rows.length > 1 && p.records.some(r => r.kind === 'permit'); });
  assert.ok(devs.length > 100);
  const before = devs.map(p => [flags(p), D.buildingPermitsOf(p).length]);
  for (const p of devs) for (const row of TG.fileRows(p)) assert.ok(N.projectByKey(`${p.key}#${row.a.ref}`));
  devs.forEach((p, i) => assert.deepEqual([flags(p), D.buildingPermitsOf(p).length], before[i], p.key));
  // (the one copy, js/dev-nav.js: devtab.js opens a file on its own through it since navigation phase 5)
  assert.match(src('js/dev-nav.js'), /P\.mergeProject\(key, \[\.\.\.own, \.\.\.permits\.filter\(r => !own\.includes\(r\)\)\]\.map\(r => \(\{ \.\.\.r \}\)\), \{\}\)/);
  assert.match(src('js/devtab.js'), /const subProject = \(p, ref\) => \(p && state\(\) \? N\(\)\.subProject\(p, ref\) : null\);/);
});

// The example the fix was found on (e1479e2: opening its files dropped it from 17 building permits to
// 3). A site check: its permits follow the weekly data, so a new one is a finding for review, not a hold.
siteTest('11903 Airport Rd keeps its 17 building permits once its files are opened on their own', { skip: !H.available() }, () => {
  const { projects } = H.realDevs();
  const N = devNav(projects), TG = require('../js/tree-groups.js'), D = require('../js/demand.js');
  const airport = projects.find(p => p.key === 'Brampton|11903 AIRPORT RD');
  assert.ok(airport, 'the development is in the data');
  for (const row of TG.fileRows(airport) || []) N.projectByKey(`${airport.key}#${row.a.ref}`);
  assert.equal(D.buildingPermitsOf(airport).length, 17);
});

test('the latest file is the newest submission (map-labels latestSub), not a sort on a field no record has', () => {
  const ev = (iso, phase = 'inception') => ({ date: new Date(`${iso}T00:00:00Z`), phase });
  const a = { ref: 'A', events: [ev('2019-01-01')] }, b = { ref: 'B', events: [ev('2024-05-01'), ev('2025-01-01', 'approved')] }, c = { ref: 'C', events: [] }, d = { ref: 'D', events: [ev('2024-05-01')] };
  assert.deepEqual(P.newestFirst([c, a, b, d]).map(r => r.ref), ['B', 'D', 'A', 'C'], 'newest first, ties in order, undated last');
  assert.equal(P.submittedAt(b), +new Date('2024-05-01T00:00:00Z'));
  assert.equal(P.submittedAt(c), null);
  for (const f of ['js/devtab.js', 'js/fsr.js', 'js/records-tab.js']) assert.doesNotMatch(src(f), /\.date \|\| 0\)\)/, f);
});

// (navigation phase 5, M3: devtab's own cache of files opened on their own went with its copy, removed by design;
// the one cache, js/dev-nav.js's, is cleared on every rebuild and index paint)
test('the files opened on their own are dropped when the developments are rebuilt: one cache, js/dev-nav.js\'s', () => {
  const app = src('js/app.js');
  assert.equal(app.match(/if \(typeof PeelDevNav !== 'undefined'\) PeelDevNav\.SUBS\.clear\(\);/g).length, 2, 'rebuild and applyIndex');
  assert.doesNotMatch(src('js/devtab.js'), /freshSubs|SUBS\./);
  assert.match(src('js/dev-nav.js'), /\}, SUBS, projectByKey, relatedProjects, fileTree, subProject, isFormal, isPrecon, flyToSite, showDetail \};/);
});
