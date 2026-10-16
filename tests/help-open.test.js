'use strict';
// Help from Home and the workspace pages (it seemed to do nothing there): since design bundle 6, Help
// is its own page, so it opens from anywhere.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Help opens the Help page from anywhere (Home, a page or the full map); a guide or the tour opens the full map first', () => {
  const s = src('js/tips.js');
  assert.match(s, /function showHelp\(\) \{\n {4}const W = root\.PeelWorkspaces; if \(W && W\.openPage\) \{ W\.openPage\('help'\); return; \}/);
  assert.match(s, /if \(e\.target\.closest\('\[data-help-open\]'\)\) return showHelp\(\);/);
  assert.match(s, /if \(toFull\(\)\) setTimeout\(\(\) => h\.go\(\), 300\); else h\.go\(\);/);
  assert.match(src('index.html'), /id="tb-help" data-help-open/);
});
