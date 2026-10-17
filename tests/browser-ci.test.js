'use strict';
// The browser click-paths run in CI on every pull request (.github/workflows/browser.yml).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the browser workflow runs on pull requests and main, with a pinned Playwright', () => {
  const w = src('.github/workflows/browser.yml');
  assert.match(w, /on:\n {2}pull_request: \{\}\n {2}push:\n {4}branches: \[main\]/);
  assert.match(w, /npm install --no-save --no-package-lock playwright@\d+\.\d+\.\d+/);
  assert.match(w, /npx playwright install --with-deps chromium/);
  assert.match(w, /run: npm run browser/);
  assert.equal(JSON.parse(src('package.json')).scripts.browser, 'node tests/browser/run.js');
});

test('the paths cover first run, Check a site, the full table, Start over, page ↔ map, the keyboard and the phone', () => {
  const r = src('tests/browser/run.js');
  for (const name of ['first run:', 'Check a site:', 'the header count opens the full table', 'Start over clears', 'a page link opens the full map', 'keyboard:', 'phone:']) assert.ok(r.includes(`check('${name}`), name);
  assert.match(r, /if \(s\.errors\.length\) fails\.push\(`page errors:/);
  assert.match(r, /process\.exit\(bad \? 1 : 0\)/);
});
