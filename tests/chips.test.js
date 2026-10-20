'use strict';
// Navigation PR 2: a development's Files (the tree) and History (with each file's source record) on
// its board, the map's panel and the Check a site page alike; chips and figures that open their answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const loadPanel = (window = {}) => { const ctx = { window }; ctx.globalThis = ctx; vm.runInNewContext(src('js/panel.js'), ctx); return window.PeelPanel; };
const PN = loadPanel();
const SC = require('../js/stage-chip.js');
const FT = require('../js/file-tree.js');

test('a header count opens the full table (your choice); a stage-tone status stays a label unless it opens something', () => {
  const h = PN.html({ key: 'svc:capacity', head: { name: 'Can the system take it?', status: { tone: 'over', text: '9 over' } }, answer: 'x' });
  assert.match(h, /<button type="button" class="pnl-chip pnl-chip-btn t-over" data-full-table="svc:capacity" title="Open the full table">9 over <span class="aer-car" aria-hidden="true">▸<\/span><\/button>/);
  assert.match(PN.html({ head: { name: 'Find', status: { tone: 'stage', text: 'Step 1 of 3' } }, answer: 'x' }), /<span class="pnl-chip t-stage">Step 1 of 3<\/span>/);
  const ws = src('js/ws-pages.js');
  assert.match(ws, /const FULL_OF = \{ home: 'tight', tight: 'tight', projects: 'projects', pipes: 'pipes' \};/);
  assert.match(ws, /attrs: \{ 'data-ws-go': FULL_OF\[id\], 'data-ws-fulltable': '1' \}, title: 'Open the full table'/);
});

test('the stage chip opens How the stage was set in place, and says what the next stage needs', () => {
  assert.match(SC.next('review'), /draft plan of subdivision or a site plan approved \(or, for 10 homes or fewer, its zoning approved\) makes it Approved, and committed/);
  assert.match(SC.next('inception'), /formal application/);
  assert.match(SC.next('approved'), /building permit/);
  const pn = src('js/panel.js');
  assert.match(pn, /attrs: \{ 'data-stage-chip': p\.key \}, expanded: SC\.isOpen\(p\.key\)/);
  assert.match(pn, /extra: `\$\{SC \? SC\.boxHTML\(p\) : ''\}\$\{AC \? AC\.boxHTML\(p\) : ''\}`/);
  assert.match(src('js/devtab.js'), /if \(part === 'stage'\) return phaseBasisHTML\(p\)/);
});

test('the site header: the latest file opens its record; "n files · history" opens History', () => {
  const pn = src('js/panel.js');
  assert.match(pn, /<button type="button" class="pnl-file tr-ref" data-dev-file="\$\{esc\(ls\.ref\)\}"/);
  assert.match(pn, /data-dev-hist="" title="History, with each file's source record">\$\{nRec\} file\$\{nRec === 1 \? '' : 's'\} · history ›<\/button>/);
});

test('the board (map panel and Check a site page): one section for the files, events and proposal', () => {
  const ov = src('js/overview-tab.js');
  assert.match(ov, /\{ title: 'Files, events and proposal', id: 'pnl-hist', open: true, html: DT && DT\.partHTML \? DT\.partHTML\(p, 'story'\) : '' \}/);
  assert.doesNotMatch(ov, /title: 'About this proposal'|id: 'pnl-files'|title: 'History and source records'/, 'no separate About, Files or History folds');
  const dt = src('js/devtab.js');
  assert.match(dt, /<div id="devtab-recs">\$\{chart\}<\/div>/, 'the old Source records id, so old links land');
  assert.match(dt, /r\.kind === 'file' && r\.rec \? fileBodyHTML\(r\.rec\)/, 'a file row opens to its events and source record');
  assert.match(dt, /<details class="tl-rec" data-rec-uid="\$\{esc\(r\.uid\)\}" data-rec-ref="\$\{esc\(r\.ref \|\| tag\)\}">/, 'a file number in an event opens its record');
  assert.match(dt, /data-tl-type="\$\{TL_FILTER\[x\.type\]\}" title="Show only/, 'the type labels filter');
  assert.doesNotMatch(dt.slice(dt.indexOf('function filesViewHTML')), /sourceRecordsHTML\(p\)/, 'no separate Source records section');
});

test('every file number in the tree opens its source record (another development\'s: that one first)', () => {
  const d = { root: 'A-1', u: 10, n: [['A-1', 0, -1, '', 'h', 0, 10, 0, 'k1'], ['A-2', 2, 0, '', 'l', 0, 0, 0, 'k2']], c: [['A-1', 10, 'stated']] };
  const h = FT.treeHTML(d, null, { devKey: 'Brampton|x', latest: 'A-2' });
  assert.match(h, /<button type="button" class="tr-ref" data-dev-file="A-1" data-dev-key="Brampton\|x" title="Its source record, in History">A-1<\/button>/);
  assert.match(h, /<button type="button" class="tr-new" data-dev-file="A-2" data-dev-key="Brampton\|x"/, 'latest');
  assert.match(h, /<button type="button" class="tr-check" data-dev-file="A-2"/, 'check');
});

test('a development\'s warnings open their answer', () => {
  const dd = src('js/dev-detail.js');
  for (const [flag, at] of [['Under appeal \\(OLT\\)', "'data-dev-hist': 'council'"], ['Stalled', "'data-dev-hist': ''"], ['Needs planned main', "'data-at': 'dca:timing'"], ['% of firm', "'data-ss': s\\.a\\.id"], ['over rated capacity', "'data-ss': `plant:\\$\\{f\\.pl\\}`"]]) assert.match(dd, new RegExp(`chipGo\\([^\\n]*${flag}[^\\n]*${at}`), flag);
  assert.match(dd, /p\.holding\.refs\[0\] \? \{ 'data-dev-file': p\.holding\.refs\[0\] \}/, 'the H flag opens its file');
  assert.match(src('js/devscope.js'), /data-at="records:files" title="Data quality/);
});

test('figures that name one thing open it; counts open the full table; every constraint row opens', () => {
  assert.match(PN.html({ head: { name: 'x' }, figures: [{ v: 1, label: 'y', attrs: { 'data-ss': 'plant:Lakeview' } }] }), /<div class="pnl-fig" data-ss="plant:Lakeview" role="button" tabindex="0">/);
  const cap = src('js/svc-capacity.js');
  assert.match(cap, /attrs: soon\.ss \|\| soon\.id \? \{ 'data-ss': soon\.ss \|\| soon\.id \} : null/);
  assert.match(cap, /attrs: f\.z \? \{ 'data-ss': f\.z\.id \} : null/);
  assert.match(cap, /attrs: \{ 'data-ss': `plant:\$\{f\.pl\}` \}/);
  assert.match(src('js/dca-tab.js'), /attrs: sc \? \{ 'data-ss': sc \} : \{ 'data-full-table': 'dca' \}/);
  assert.match(src('js/ws-pages.js'), /: \{ 'data-ws-go': 'tight', 'data-ws-fulltable': '1', title: `\$\{r\.name\}: in the full table` \}/, 'the Caledon well systems');
  assert.match(src('js/capital-ea.js'), /attrs: open\.length === 1 \? \{ 'data-ce-open': `ea:\$\{open\[0\]\.e\.id\}` \}/);
});
