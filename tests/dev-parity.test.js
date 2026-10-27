'use strict';
// M3 (docs/architecture-review/pros-and-cons.md): the devtab copies and the canonical modules give the same
// answer on the shipped developments, and a development's figures agree wherever they show; written before
// the copies went (navigation phase 5, S13). Since S13 devtab.js delegates to the canonical modules, so tests
// 1 and 2 are the guard that it reads them (and keeps no copy); test 5 is M4's one tree renderer.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers/real-devs.js');

const skip = !H.available();
let env = null;
// The app's globals the modules read at load, the real developments in PeelApp.state (as app.js leaves
// them after holdDormant: a few held aside, every one in .all), then the modules themselves.
function load() {
  if (env) return env;
  const { projects } = H.realDevs();
  const P = require('../js/phases.js');
  Object.assign(globalThis, { window: globalThis, PeelUtil: require('../js/util.js'), PeelPhases: P, PeelDemand: require('../js/demand.js'),
    PeelTreeGroups: require('../js/tree-groups.js'), PeelTreeCounts: require('../js/tree-counts.js'), PeelFileTree: require('../js/file-tree.js'),
    PeelMapCore: { map: {} }, document: { addEventListener() {}, documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  globalThis.PeelPanel = require('../js/panel.js');
  // A few developments held aside, the way app.js holdDormant holds the dormant ones and the site activity.
  const aside = new Set(projects.filter(p => p.records.some(r => r.kind === 'application')).filter((p, i) => i % 97 === 5).slice(0, 12));
  const keep = projects.filter(p => !aside.has(p)), dorm = [...aside].slice(0, 6), site = [...aside].slice(6);
  Object.defineProperty(keep, 'dormant', { value: dorm }); Object.defineProperty(keep, 'siteActivity', { value: site }); Object.defineProperty(keep, 'all', { value: projects });
  globalThis.PeelApp = { state: { projects: keep, treeGrouped: true } };
  const req = f => { delete require.cache[require.resolve(f)]; return require(f); };
  env = { projects, aside: [...aside], P, D: globalThis.PeelDemand, DD: req('../js/dev-detail.js'), DN: req('../js/dev-nav.js'), DT: req('../js/devtab.js'), RT: req('../js/records-tab.js'), G: req('../js/growth.js') };
  // (devtab reads the status from window.PeelDevDetail; window.PeelDevNav is set only by the tests that need it:
  // with it, Records' panel lists the related developments for every one of the 4,626 in test 3)
  globalThis.PeelDevDetail = env.DD;
  return env;
}
const withNav = (DN, fn) => { globalThis.PeelDevNav = DN; try { return fn(); } finally { delete globalThis.PeelDevNav; } };
const SRC = f => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', f), 'utf8');
const withFiles = p => (p.records || []).some(r => r.kind === 'application');

test('statusOf: Records\' copy and the development model agree on every file development', { skip }, () => {
  const { projects, DT, DD } = load();
  let n = 0;
  for (const p of projects.filter(withFiles)) {
    const a = DT.statusOf(p), b = DD.statusOf(p);
    for (const k of ['why', 'stalled', 'appealed', 'state', 'cause', 'lastAt', 'latestAt']) assert.deepEqual(a[k], b[k], `${p.key}: ${k}`);
    assert.deepEqual(a.sig, b.sig, `${p.key}: the status signals`);
    assert.ok(Math.abs(a.years - b.years) < 1e-6, `${p.key}: years`);
    assert.equal(DT.planApprovedNote(p), DD.planApprovedNote(p), `${p.key}: the plan-approved note`);
    n++;
  }
  assert.ok(n > 4000, `${n} file developments`);
  assert.doesNotMatch(SRC('js/devtab.js'), /const STATUS_SIGNALS =|function statusOf\(|function planApprovedNote\(/, 'no copy left (S13)');
});

// Servicing tags are left out on purpose: the devtab copy tags a file on its own lite (tagAreasLite: the
// pressure zone and drainage), dev-nav's the servicing areas (PeelSvcData.tagAreas). That drift S13's
// deletion resolves in dev-nav's favour. relatedProjects is not compared here: dev-nav's needs Leaflet's
// bounds, and both copies share one cache on the project (p._rel), so the browser path compares it.
test('the file tree, a file on its own and a development by key agree', { skip }, () => withNav(load().DN, () => {
  const { projects, aside, DT, DN } = load();
  assert.doesNotMatch(SRC('js/devtab.js'), /function (fileTree|subProject|projectByKey|relatedProjects|landShare|landRel|tagAreasLite|devBbox)\(/, 'no copy left (S13)');
  const rows = rs => rs.map(r => `${r.a.ref}:${(r.pre || []).map(x => x.ref).join('+')}`).join('|');
  const files = projects.filter(withFiles);
  for (const p of files) assert.equal(rows(DT.fileTree(p)), rows(DN.fileTree(p)), p.key);
  const fields = s => (s ? [s.key, s.title, s.units, s.records.length, s.phase] : null);
  const big = files.filter(p => DN.fileTree(p).length > 1).sort((a, b) => DN.fileTree(b).length - DN.fileTree(a).length).slice(0, 40);
  assert.equal(big.length, 40);
  for (const p of big) for (const row of DN.fileTree(p)) {
    const ref = row.a.ref;
    assert.deepEqual(fields(DT.subProject(p, ref)), fields(DN.subProject(p, ref)), `${p.key}#${ref}`);
    assert.deepEqual(fields(DT.projectByKey(`${p.key}#${ref}`)), fields(DN.projectByKey(`${p.key}#${ref}`)), `${p.key}#${ref} by key`);
  }
  for (const p of [...big, ...files.slice(0, 200)]) { assert.equal(DT.projectByKey(p.key), p, p.key); assert.equal(DN.projectByKey(p.key), p, p.key); }
  // A development held aside (dormant, site activity) opens by its key in both: devtab looks in .all,
  // dev-nav in the list, then .dormant, then .siteActivity.
  assert.equal(aside.length, 12);
  for (const p of aside) { assert.equal(DT.projectByKey(p.key), p, `${p.key} (held aside)`); assert.equal(DN.projectByKey(p.key), p, `${p.key} (held aside)`); }
}));

test('a development\'s units agree on the Overview, the trail, Growth and Records', { skip }, () => {
  const { projects, D, G, RT } = load();
  const fmt = n => Math.round(n || 0).toLocaleString('en-CA');
  const tree = projects.filter(p => p.count && p.count.mode === 'tree');
  let lost = 0;
  for (const p of tree) {
    const want = fmt(p.units);
    assert.equal(fmt(D.estimate([p], D.DEFAULT_CRITERIA, 'all', () => null).totalUnits), want, `${p.key}: the Overview`);
    // (the trail and Growth both read Growth.pipelineTotals: js/topbar.js renderTrail, js/growth-ui.js)
    assert.equal(fmt(G.pipelineTotals([p]).planned), p.units > 0 ? want : '0', `${p.key}: the trail and Growth`);
    const spec = RT.filesPanelSpec(p), fig = spec.figures.find(f => f.label === 'counted once');
    assert.ok(fig, `${p.key}: a tree development draws its tree`);
    assert.equal(fig.v, want, `${p.key}: Records`);
    if (p.unitsLost > 0) { lost++; assert.match(fig.ctx, new RegExp(`^net of ${fmt(p.unitsLost)} demolished \\(`), `${p.key}: Records says net`); assert.match(spec.answer, /net of [\d,]+ demolished/); }
  }
  assert.ok(tree.length > 4000, `${tree.length} tree developments`);
  assert.ok(lost > 40, `${lost} with demolitions`);
});

// The same line where the count is not the tree's (its files differ from the build, or a count was entered):
// the development keeps its tree entry, so Records draws the tree under a figure that is the development's
// count, and says why (js/records-tab.js filesPanelSpec; no such development in today's data).
test('Records says when a development\'s homes are not the tree build\'s', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const s = { files: 2, root: 'OZ-1', top: 'OZ-1', units: 140, counted: [{ ref: 'OZ-1', units: 140 }], check: 0, onLand: 1, sameLand: 0 };
  const FT = { of: () => ({}), summary: () => s, recLookup: () => () => null, nodeOf: () => null, treeHTML: () => '' };
  const PN = { siteHead: () => ({}), kv: (a, b) => ({ html: `${a} ${b}` }), typeWords: t => t };
  const ctx = { PeelUtil: { $: () => null, esc: x => String(x), fmtNum: n => Number(n).toLocaleString('en-CA'), dot: () => '' }, PeelPanel: PN, PeelFileTree: FT, PeelPhases: { PHASE_BY_KEY: {} }, console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'records-tab.js'), 'utf8'), ctx);
  const RT = ctx.PeelRecordsTab, rec = { kind: 'application', ref: 'OZ-1', municipality: 'B' };
  const fig = p => RT.filesPanelSpec(p).figures.find(f => f.label === 'counted once');
  const changed = { key: 'k', title: 'K', municipality: 'B', units: 100, records: [rec], count: { mode: 'previous', why: 'its files differ from the tree build of 2026-10-12' } };
  assert.deepEqual([fig(changed).v, fig(changed).ctx], ['100', 'counted from its files and permits (the tree build counts 140)']);
  assert.match(RT.filesPanelSpec(changed).answer, /<strong>OZ-1<\/strong> holds the <strong>100<\/strong> homes, counted from its files and permits; 1 file sits on its land\./);
  const net = { ...changed, units: 138, unitsLost: 2, count: { mode: 'tree' } };
  assert.deepEqual([fig(net).v, fig(net).ctx], ['138', 'net of 2 demolished (140 on the files)']);
  assert.match(RT.filesPanelSpec(net).answer, /<strong>138<\/strong> homes, net of 2 demolished/);
  const plain = { ...changed, units: 140, count: { mode: 'tree' } };
  assert.deepEqual([fig(plain).v, fig(plain).ctx], ['140', 'on OZ-1']);
});

// M4 (navigation phase 5, S13): Records' full table draws a development's files with the panel's tree renderer
// (js/file-tree.js), so its homes "counted here" are the tree's count parts, file by file (the old list's per-file
// figures differed from the tree for 172 of the 881 multi-file developments; a count can sit on an earlier file on
// the same land, in the tree's fold), each file openable on its own; a development with no tree entry keeps the list.
test('Records\' full table draws the files with the tree: the homes counted here are the tree\'s', { skip }, () => {
  const { projects, DT, DN } = load();
  const FT = globalThis.PeelFileTree, num = n => Math.round(n).toLocaleString('en-CA');
  // (dev-nav's related developments use the map's bounds: a plain box per development here, worked out once)
  const boxes = new WeakMap();
  const projectBounds = p => {
    if (boxes.has(p)) return boxes.get(p);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of p.records) {
      if (r.poly) for (const ring of r.poly) for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      else if (r.lat != null) { x0 = Math.min(x0, r.lng); y0 = Math.min(y0, r.lat); x1 = Math.max(x1, r.lng); y1 = Math.max(y1, r.lat); }
    }
    const b = x0 === Infinity ? null : { x0, y0, x1, y1, intersects: q => !(q.x1 < x0 || q.x0 > x1 || q.y1 < y0 || q.y0 > y1) };
    boxes.set(p, b); return b;
  };
  globalThis.PeelMapMarkers = { projectBounds };
  withNav(DN, () => {
    let n = 0;
    for (const p of projects) {
      const d = FT.of(p); if (!d || FT.summary(d).files < 2) continue;
      const rows = DT.filesHTML(p).split('<div class="tr-row">').slice(1);
      const here = new Map(rows.map(r => [/data-dev-file="([^"]+)"/.exec(r)[1], /<b>([\d,]+)<\/b>homes · counted here/.exec(r)]).filter(([, m]) => m).map(([ref, m]) => [ref, m[1]]));
      // (a count part on no file of the tree, e.g. one with no file number, is the tree build's; the panel shows none either)
      assert.deepEqual(here, new Map(FT.summary(d).counted.filter(c => FT.nodeOf(d, c.ref)).map(c => [c.ref, num(c.units)])), `${p.key}: counted here`);
      const own = rows.map(r => [/data-dev-file="([^"]+)"/.exec(r)[1], (/class="btn small link tr-own" data-dt-sub="([^"]+)"/.exec(r) || [])[1]]);
      assert.ok(own.every(([ref, sub]) => sub === ref), `${p.key}: each file opens on its own`);
      for (const [ref] of own) assert.ok(DN.subProject(p, ref), `${p.key}#${ref}: "on its own" opens it`);
      n++;
    }
    assert.ok(n > 800, `${n} multi-file tree developments`);
    // No tree entry (the tree counts did not load, or permits only): the list, as before.
    const p = projects.find(q => !q.parent && q.records.filter(r => r.kind === 'application' && r.stage !== 'precon').length > 2 && FT.of(q));
    const of = FT.of; FT.of = () => null;
    try { const html = DT.filesHTML(p); assert.match(html, /<ul class="file-tree">/); assert.doesNotMatch(html, /class="tr"/); } finally { FT.of = of; }
  });
  delete globalThis.PeelMapMarkers;
});
