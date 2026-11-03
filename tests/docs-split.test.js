'use strict';
// Navigation phase 9 (D-G3 with change): the README is short; the rest of it is in docs/guide, docs/method and docs/data,
// each section moved whole. The four files link to one another, and every link and anchor works (GitHub's heading slugs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FILES = ['README.md', 'docs/guide/README.md', 'docs/method/README.md', 'docs/data/README.md'];
const lines = f => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
// Headings outside code fences, with the anchor GitHub gives each (a repeat gets -1, -2 …).
const headings = f => {
  const out = [], seen = {}; let fence = false;
  lines(f).forEach((l, i) => {
    if (/^```/.test(l)) fence = !fence;
    const m = !fence && /^(#{1,6}) (.+)$/.exec(l);
    if (!m) return;
    const base = m[2].trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const n = seen[base] = (seen[base] || 0) + 1;
    out.push({ level: m[1].length, text: m[2].trim(), anchor: n > 1 ? `${base}-${n - 1}` : base, line: i + 1 });
  });
  return out;
};
// Markdown links to a relative path (not http, not mailto), outside code fences.
const links = f => {
  const out = []; let fence = false;
  lines(f).forEach((l, i) => {
    if (/^```/.test(l)) fence = !fence;
    if (fence) return;
    for (const m of l.matchAll(/\]\(([^)\s]+)\)/g)) if (!/^(https?:|mailto:)/.test(m[1])) out.push({ href: m[1], line: i + 1 });
  });
  return out;
};

test('the README is short and points at the three files; each of them points back', () => {
  assert.ok(lines('README.md').length < 300, 'the short README');
  for (const f of FILES.slice(1)) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
    assert.equal(headings(f)[0].level, 1, `${f} starts with its title`);
    assert.ok(links(f).some(l => l.href === '../../README.md'), `${f} links back to the README`);
  }
  assert.ok(headings('README.md').some(h => h.text === 'Where the rest is'), 'the index');
});

test('every relative link in the README and the docs it was split into reaches a file and a heading', () => {
  let n = 0;
  for (const f of FILES) {
    for (const { href, line } of links(f)) {
      const [file, anchor] = href.split('#');
      const target = file ? path.normalize(path.join(path.dirname(f), file)) : f;
      assert.ok(fs.existsSync(path.join(ROOT, target)), `${f}:${line}: ${href}: no such file`);
      if (anchor) assert.ok(headings(target).some(h => h.anchor === anchor), `${f}:${line}: ${href}: no such heading in ${target}`);
      n++;
    }
  }
  assert.ok(n > 80, 'the index and the cross-links were found');
});

test('the README index lists every section of the three docs once, with its own anchor, in order', () => {
  const from = headings('README.md').find(h => h.text === 'Where the rest is').line;
  const idx = links('README.md').filter(l => l.line > from).map(l => l.href);
  for (const f of FILES.slice(1)) {
    const want = headings(f).filter(h => h.level === 2).map(h => `${f}#${h.anchor}`);
    assert.deepEqual(idx.filter(h => h.startsWith(`${f.replace('/README.md', '')}/README.md#`)), want, f);
  }
});

test('the few pointers that cross a file are links, not names', () => {
  assert.match(lines('README.md').join('\n'), /weekly data refresh: see \[Deploy checks\]\(docs\/data\/README\.md#deploy-checks\)/);
  assert.match(lines('docs/guide/README.md').join('\n'), /see \*Step B1\* in \[How the numbers are worked out\]\(\.\.\/method\/README\.md#step-b1-tree-counts-in-the-app-previous--tree-switch\)/);
});
