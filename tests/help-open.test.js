'use strict';
// Help from Home and the workspace pages: the side panel Help opens in is hidden on a page, so the
// button opens the full map first (it seemed to do nothing).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('Help opens the full map first when a page is showing', () => {
  assert.match(src('js/tips.js'), /if \(e\.target\.closest\('\[data-help-open\]'\)\) \{\n {6}if \(document\.documentElement\.classList\.contains\('home-on'\) && root\.PeelWorkspaces && root\.PeelWorkspaces\.setMode\) root\.PeelWorkspaces\.setMode\('full'\);\n {6}return showHelp\(\);/);
  assert.match(src('index.html'), /id="tb-help" data-help-open/);
});
