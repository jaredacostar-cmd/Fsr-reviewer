'use strict';
// Navigation review, fix-now: buttons that did nothing now do what they say.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('"all in History" from outside the development views opens Records › Files at History, in the full table', () => {
  const d = src('js/devtab.js');
  assert.match(d, /const out = e\.target\.closest\('\[data-dt-open\]'\);\n {4}if \(out && !\(body && body\.contains\(out\)\)\) \{ openSection\(out\.dataset\.dtOpen\); return; \}/);
  assert.match(d, /function openSection\(id\) \{[^]*?AT\.openTab\('records', 'files'\)[^]*?PN\.openFull\(\)[^]*?d\.open = true; d\.scrollIntoView/);
});

test('a plant\'s or the water system\'s "Show on the map" fits the map to the area it serves', () => {
  const s = src('js/svc-scope.js');
  assert.match(s, /attrs: s\.a \? \{ 'data-pnl-focus': s\.a\.id \} : \{ 'data-ss-fit': s\.ref \}/);
  assert.match(s, /function fitScope\(ref\) \{[^]*?map\.fitBounds\(\[\[b\[1\], b\[0\]\], \[b\[3\], b\[2\]\]\]/);
});

// (navigation phase 5: the site bar's Tools ▾ is the header's ⋯, on every tab and the page)
test('⋯ › Record allocation opens the allocation form, a fold of the development\'s Servicing panel', () => {
  assert.match(src('js/panel.js'), /\{ label: 'Record allocation', attrs: \{ 'data-scope-alloc': '' \}/);
  assert.match(src('js/devscope.js'), /const al = e\.target\.closest\('\[data-scope-alloc\]'\);\n\s+if \(al\) \{ const h = H\(\); if \(h && h\.showAllocSub\) h\.showAllocSub\(\); return; \}/);
  assert.match(src('js/svc-capacity.js'), /\{ title: 'Servicing allocation', id: 'pnl-alloc', html: root\.PeelDemandUI && root\.PeelDemandUI\.allocBoxHTML \? root\.PeelDemandUI\.allocBoxHTML\(p\) : '' \}/);
  assert.match(src('js/demand-ui.js'), /const api = \{ allocBoxHTML,/);
  assert.match(src('js/app.js'), /showAllocSub: \(\) => \{[^]*?openTab\('svc', 'network'\)[^]*?getElementById\('pnl-alloc'\)[^]*?d\.open = true/);
});

test('"See its tree" opens Records › Files; "Open one on its own" makes the file the development in scope', () => {
  assert.match(src('js/aerial-check.js'), /\[data-file-tree\][^\n]*PeelAnalysisTabs\.openTab\('records', 'files'\)/);
  assert.match(src('js/devtab.js'), /if \(N && N\.showDetail\) \{ drill = null; N\.showDetail\(p\); return; \}/);
});

test('the Study area page\'s selection buttons work on the page; Copy share link confirms with a toast', () => {
  const a = src('js/area-select.js');
  assert.match(a, /\$\('#scope-body'\)\.addEventListener\('click', selClick\);/);
  assert.match(a, /h\.addEventListener\('click', e => \{ if \(e\.target\.closest\('\[data-page-map\], \.page-sel'\)\) selClick\(e\); \}\)/);
  assert.match(src('js/share.js'), /window\.PeelUtil\.toast\('Link copied: it opens this view, with its filters and scenario'\)/);
  assert.match(src('js/util.js'), /function toast\(text, ms = 2600\) \{[^]*?setAttribute\('role', 'status'\)/);
});

test('the Help guides point at the right places', () => {
  const t = src('js/tips.js');
  assert.doesNotMatch(t, /\+ Save this view \(sidebar\)/);
  assert.doesNotMatch(t, /also in the Settings gear/);
  assert.match(t, /getElementById\('tb-export'\); if \(b\) b\.click\(\);/, '"Save, share and export" opens the Export menu');
});
