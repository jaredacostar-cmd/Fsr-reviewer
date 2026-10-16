'use strict';
// Design bundle 6 — organization: a development's files as a tree (Records › Files, the rows of
// Growth in an area, the estimate rows), one stage on each row, and the rest of the reorganization.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const T = require('../js/file-tree.js');
const TREE = require('../data/tree-counts.json');
const dev = k => TREE.devs.find(d => d.k === k);

test('file tree: one root, the files on its land under it, earlier files on the same land folded, links to check', () => {
  const d = dev('Brampton|295 QUEEN ST E');
  const s = T.summary(d);
  assert.deepEqual([s.files, s.root, s.units, s.check, s.onLand, s.sameLand], [11, 'OZS-2025-0022', 7641, 2, 4, 6]);
  const h = T.treeHTML(d, null, { dot: k => `<i class="dot" data-k="${k}"></i>` });
  assert.match(h, /<span class="tr-ref">OZS-2025-0022<\/span>[\s\S]*?<b>7,641<\/b>homes · counted here/);
  assert.equal((h.match(/<span class="tr-check"/g) || []).length, 2 + 1, 'two links to check, and the key line');
  assert.match(h, /<details class="tr-same"><summary>\+ 6 earlier files on the same land: the site's history, not counted<\/summary>/);
  assert.match(T.summaryHTML(d), /^<b>11<\/b> files · homes counted on <b>OZS-2025-0022<\/b> \(official plan \/ zoning\)|^<b>11<\/b> files · homes counted on <b>OZS-2025-0022<\/b>/);
  assert.match(T.summaryHTML(d), /<span class="tr-check"[^>]*>check<\/span> 2 links$/);
});

test('file tree: a block plan that states no count adds up its draft plans, and they come first', () => {
  const d = dev('Brampton|2055 BOVAIRD DR W');
  const s = T.summary(d);
  assert.equal(s.top, 'PRE-2023-0100'); assert.equal(s.counted.length, 4);
  assert.equal(s.counted.reduce((t, c) => t + c.units, 0), s.units, 'the parts add up to the development');
  assert.deepEqual(T.build(d).root.kids.slice(0, 4).map(k => k.ref), ['OZS-2025-0034', 'OZS-2024-0051', 'OZS-2025-0032', 'C05W07.006']);
  const h = T.treeHTML(d, null, { limit: 4 });
  assert.match(h, /<b>9,862<\/b>homes in all, on the files below/);
  assert.match(h, /<b>2,929<\/b>homes · counted here \(estimate\)/);
  assert.match(T.summaryHTML(d), /homes counted on 4 files, most on <b>OZS-2025-0034<\/b>/);
  assert.deepEqual(T.estimateOf(d), { ref: 'OZS-2024-0051', units: 2929, kind: 'online', source: 'Brampton PDC agenda / recommendation report, 2025-10-06' });
});

test('Records › Files: the tree, then the latest activity; Growth rows: one stage, the files line, ▸ the tree; estimate rows name their file', () => {
  const r = src('js/records-tab.js');
  assert.match(r, /chart: `<h3 class="sub-title pnl-chart-t">How the files fit together <span class="pnl-chart-u">\(each under the file whose land holds it\)<\/span><\/h3>\$\{FT\.treeHTML\(d, recOf,/);
  assert.match(r, /lists: \[\{ title: 'Latest activity', rows: latest,/);
  assert.match(r, /label: 'to check', ctx: 'linked by overlap only'/);
  const w = src('js/ws-pages.js');
  assert.match(w, /title: gStage === 'all' \? `Developments in \$\{n\.name\}` : `\$\{STG\[gStage\]\}: developments in \$\{n\.name\}`/);
  assert.doesNotMatch(w, /`Files in \$\{n\.name\}`/);
  // "In review · In review": the stage once.
  const body = w.slice(w.indexOf('    const stageLine = x =>'), w.indexOf('    const treeBits = p =>'));
  const stageLine = new Function('STG', 'Ph', 'esc', `${body}; return stageLine;`)({ review: 'In review', permitted: 'Permit issued / building' }, { PHASE_BY_KEY: { review: { label: 'In review' }, construction: { label: 'Under construction' } } }, s => s);
  assert.equal(stageLine({ st: 'review', p: { phase: 'review' } }), 'In review');
  assert.equal(stageLine({ st: 'permitted', p: { phase: 'construction' } }), 'Permit issued / building · Under construction');
  assert.match(w, /data-tr-tog="\$\{esc\(p\.key\)\}" aria-expanded="\$\{on\}"/);
  assert.match(w, /<small class="tr-sum">the estimate is on <b>\$\{esc\(e\.ref\)\}<\/b>/);
  assert.match(w, /const had = files\.find\(f => f\.p === p\);/, 'one estimate row per development');
  assert.match(src('js/workspaces.js'), /if \(pk && pk\.dataset\.wsTree\) \{ e\.preventDefault\(\); setMode\('full'\); pickDev\(pk\.dataset\.wsPick\); setTimeout\(\(\) => \{ const AT = root\.PeelAnalysisTabs; if \(AT && AT\.openTab\) AT\.openTab\('records', 'files'\);/);
  // The site bar: "n links to check" opens the tree.
  assert.match(src('js/dev-detail.js'), /data-tree-check title="Files linked to this development by overlap only/);
  assert.match(src('index.html'), /<script src="js\/file-tree\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/file-tree\.js',/);
});

test('10 or fewer homes with zoning approved: Approved, explained where the stage is set', () => {
  for (const f of ['js/devtab.js', 'js/fsr.js']) assert.match(src(f), /except a site of 10 or fewer homes, which needs no site plan since Bill 23/, f);
  assert.match(src('js/panel.js'), /\$\{p\.smallSite \? ' · no site plan needed' : ''\}/);
  assert.match(src('js/approvals-guide.js'), /\[3, 1, 'ok', '≤ 10 homes: zoning approved → Approved'/);
});
