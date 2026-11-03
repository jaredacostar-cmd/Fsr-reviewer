'use strict';
// Site-pinned tests: strict on a pull request; reported, not fatal, in the weekly refresh (SITE_CHECKS=warn).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('a changed site check fails a pull request and is reported in the weekly refresh', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-check-'));
  const file = path.join(dir, 'x.test.js'), report = path.join(dir, 'report.jsonl');
  fs.writeFileSync(file, `const { siteTest } = require(${JSON.stringify(path.join(__dirname, 'helpers', 'site-check.js'))});
const assert = require('node:assert/strict');
siteTest('Embleton: 343 left to permit', () => assert.equal(299, 343, 'left to permit'));
siteTest('Bovaird: in review', () => assert.equal(1, 1));\n`);
  // (without the parent runner's context, so the child reports and exits on its own)
  const base = { ...process.env }; delete base.NODE_TEST_CONTEXT;
  const run = env => spawnSync(process.execPath, ['--test', file], { env: { ...base, SITE_CHECKS: '', SITE_CHECKS_REPORT: '', ...env }, encoding: 'utf8' });
  assert.notEqual(run({}).status, 0, 'strict: the pull request fails');
  const warn = run({ SITE_CHECKS: 'warn', SITE_CHECKS_REPORT: report });
  assert.equal(warn.status, 0, warn.stdout);
  const lines = fs.readFileSync(report, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map(l => l.test), ['Embleton: 343 left to permit'], 'only the changed one');
  assert.match(lines[0].message, /left to permit/);
});

test('a changed site check reports what changed, not only that it did', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-check-'));
  const file = path.join(dir, 'x.test.js'), report = path.join(dir, 'report.jsonl');
  fs.writeFileSync(file, `const { siteTest } = require(${JSON.stringify(path.join(__dirname, 'helpers', 'site-check.js'))});
const assert = require('node:assert/strict');
siteTest('295 Queen St E: files, root, units', () => assert.deepEqual([8, 'OZS-2025-0022', 7641], [7, 'OZS-2025-0022', 7641]));\n`);
  const base = { ...process.env }; delete base.NODE_TEST_CONTEXT;
  const warn = spawnSync(process.execPath, ['--test', file], { env: { ...base, SITE_CHECKS: 'warn', SITE_CHECKS_REPORT: report }, encoding: 'utf8' });
  assert.equal(warn.status, 0, warn.stdout);
  const { message } = JSON.parse(fs.readFileSync(report, 'utf8').trim());
  assert.match(message, /^Expected values to be strictly deep-equal:/);
  assert.match(message, /\+ 8,/, 'the new value');
  assert.match(message, /- 7,/, 'the old one');
});

test('the site-pinned tests use it; totals and privacy stay strict', () => {
  const src = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  for (const [f, n] of [['addresses.test.js', 1], ['capital-outputs.test.js', 1], ['condo-registered.test.js', 1], ['dc-gate-ui.test.js', 1], ['dev-model-keys.test.js', 2], ['file-references.test.js', 4], ['layer-bar.test.js', 1], ['layers.test.js', 2], ['ledger-years.test.js', 1], ['one-application.test.js', 1], ['organization.test.js', 2], ['plan-area.test.js', 2], ['sites.test.js', 3], ['stalled.test.js', 1], ['tree-permit-boundary.test.js', 2], ['unit-basis.test.js', 2]]) {
    assert.equal((src(f).match(/^siteTest\(/gm) || []).length, n, f);
  }
  assert.match(src('layers.test.js'), /^test\('the sum over layers == the Peel totals on the Overview'/m);
  assert.doesNotMatch(src('privacy-data.test.js'), /siteTest/);
});
