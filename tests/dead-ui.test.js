'use strict';
// Nothing drawn for a place that is never shown, and nothing read from an id that is never drawn:
// the hidden Watch-tab copies of This week, Home's leftovers, the checks list drawn twice, the memo's
// works and mains, the aerial and quality renderers, and Watch on the site page.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const allJs = () => fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => src(`js/${f}`)).join('\n') + src('index.html');

test('T4: no hidden copies of This week in the Watch tab', () => {
  assert.doesNotMatch(src('index.html'), /class="week-moved"|id="week-count"|id="changes-list"|id="ce-week-list"/);
  assert.doesNotMatch(src('js/app.js'), /#changes-list|#week-count|renderWeek\(/);
  assert.doesNotMatch(src('js/capital-ea.js'), /function renderWeek\(/);
  assert.match(src('index.html'), /id="backfill-note"/);
});
test('HP-24: no Home leftovers', () => {
  assert.equal(require(path.join(ROOT, 'js/workspaces.js')).defaultWs, undefined);
  assert.doesNotMatch(src('js/workspaces.js'), /renderHome|homeMapSVG/);
});
test('T8: the data checks list is drawn once (the duplicate check panel)', () => {
  const n = (allJs().match(/<ul class="audit-checks">/g) || []).length;
  assert.equal(n, 1);
  assert.match(src('js/data-tab.js'), /<ul class="audit-checks">/);
});
test('DV-10: the memo reads ids that exist and has its works', () => {
  const r = src('js/reports.js'), all = allJs();
  assert.match(r, /function devMemo\(p\) \{\n[^\n]*\n\s*st\.works = st\.works \|\| \(DI\(\) && DI\(\)\.devWorks \? DI\(\)\.devWorks\(p, f\) : null\);/);
  for (const [, id] of r.matchAll(/domText\('([\w-]+)'\)/g)) assert.match(all, new RegExp(`id="${id}"`), id);
  for (const k of ['water', 'sanitary', 'storm']) assert.match(r, new RegExp(`domText\\('dev-exist-${k}'\\)`));
  for (const k of ['water', 'sanitary', 'storm']) assert.match(src('js/fsr.js'), new RegExp(`id="dev-exist-${k}"`));
});
test('RST-24: no renderers for ids nothing draws', () => {
  const all = allJs();
  assert.doesNotMatch(src('js/aerial-check.js'), /#aerial-check|function runAerial|function renderAerial/);
  assert.doesNotMatch(src('js/demand-ui.js'), /#d-quality|function renderQuality/);
  assert.doesNotMatch(src('js/dev-detail.js'), /function devHeadHTML|data-open="d-quality"/);
  // every static data-open target is an id somewhere (or its f- copy in the full table)
  for (const [, id] of all.matchAll(/data-open="([\w-]+)"/g)) assert.ok(new RegExp(`id="(f-)?${id}"`).test(all), id);
});
test('DV-12: a site page can be watched from the page', () => {
  assert.match(src('js/ws-pages.js'), /function site\(\)[\s\S]*?actions: \[[^\n]*'data-watch': p\.key/);
  assert.match(src('js/ws-pages.js'), /Star a development with ☆ Watch \(its page or the map\)/);
});
