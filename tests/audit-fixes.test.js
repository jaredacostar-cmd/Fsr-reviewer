'use strict';
// Overnight audit: the fixes that change no calculation (exports, caches, inputs, the calendar file).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('CSV cells: quoted when needed (CR too), source text never runs as a formula, numbers left alone', () => {
  const { csvCell } = require('../js/util.js');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  for (const v of ['+1 call', '@SUM', '-Main St', '\tx']) assert.ok(csvCell(v).replace(/^"/, '').startsWith("'"), v);
  assert.equal(csvCell('-12'), '-12'); assert.equal(csvCell(-5), '-5'); assert.equal(csvCell('+3.5'), '+3.5');
  assert.equal(csvCell('a\rb'), '"a\rb"'); assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell(null), '');
  assert.equal(csvCell('plain', true), '"plain"');
  // Every CSV writer goes through it.
  for (const f of ['js/exports.js', 'js/area-select.js', 'js/data-tab.js', 'js/plan-tables.js', 'js/changelog.js', 'js/demand-ui.js', 'js/workspaces.js', 'js/usage.js', 'js/capital-ea.js', 'js/dca-tab.js']) {
    assert.match(src(f), /csvCell\(v/, f);
    assert.doesNotMatch(src(f), /`"\$\{String\(v[^`]*\.replace\(\/"\/g, '""'\)\}"`/, `${f}: no hand-rolled quoting left`);
  }
});

test('EA calendar: semicolons escaped, lines folded at 75 octets between characters, the screening line', () => {
  const M = require('../js/capital-ea-model.js');
  const e = { id: 'x1', name: 'Queen Street East – Highway 50 – The Gore Road corridor study; phase 2, a long name that wraps', status: 'ongoing' };
  const t = M.eaICS([{ e, m: { type: 'commentEnd', date: '2026-10-23' } }], '2026-10-17T00:00:00Z');
  const lines = t.split('\r\n');
  assert.ok(lines.every(l => Buffer.byteLength(l) <= 75), 'every line ≤ 75 octets');
  const unfolded = t.replace(/\r\n /g, '');
  assert.match(unfolded, /corridor study\\; phase 2\\, a long name/);
  assert.match(unfolded, /General screening results only\. Peel's W&WW Infrastructure Planning team must validate or confirm all results\./);
  assert.ok(!/�/.test(Buffer.from(t, 'utf8').toString('utf8')), 'no character split');
});

test('exports: no "2026 mm" for a main without a diameter; coordinates as numbers; "already" in the timing CSV', () => {
  const ex = src('js/exports.js');
  assert.match(ex, /\$\{w\.ww\.ln\.d \? `\$\{w\.ww\.ln\.d\}mm ` : ''\}/);
  assert.match(ex, /lat: p\.lat != null \? \+p\.lat\.toFixed\(6\) : ''/);
  const dca = src('js/dca-tab.js');
  assert.match(dca, /r\.rows\.some\(x => x\.c\.out === 'today'\) && r\.outY === MM\(\)\.THIS_YEAR \? 'already'/);
  assert.match(dca, /\[\.\.\.\(isPublic\(\) \? \[\] : \[dec === 'Keep' \? SCREEN\.within : SCREEN\.outside\]\), r\.name,/, 'the funding CSV in the screen\'s words');
});

test('EAs: the CSV, GeoJSON and map button list what the screen lists (All at a site with no current EA)', () => {
  const s = src('js/capital-ea.js');
  assert.match(s, /const fx = near && !eaTab\.picked && !cur\.length && scoped\.length \? \{ \.\.\.eaTab\.f, show: 'all' \} : eaTab\.f;/);
  assert.match(src('js/capital-ea-model.js'), /const fx = o\.near && !o\.picked && !cur\.length && scoped\.length \? \{ \.\.\.f, show: 'all' \} : f;/, 'the same rule as the list');
});

test('alerts: the badge counts what the panel shows (watched developments and capacity items)', () => {
  const A = require('../js/alerts.js');
  const feed = { items: [{ date: '2026-10-12', development: { key: 'a' } }, { date: '2026-10-12', development: { key: 'b' } }, { date: '2026-10-12' }] };
  assert.equal(A.devItems(feed, ['a']).length + A.infraItems(feed).length, 2);
  assert.match(src('js/alerts.js'), /const shown = \{ items: \[\.\.\.devItems\(feed, st \? st\.get\('watch', \[\]\) \|\| \[\] : \[\]\), \.\.\.infraItems\(feed\)\] \};/);
});

test('caches keyed on the developments themselves, not their count', () => {
  const { idOf } = require('../js/util.js');
  const a = [1], b = [1];
  assert.equal(idOf(a), idOf(a)); assert.notEqual(idOf(a), idOf(b)); assert.equal(idOf(null), 0);
  assert.match(src('js/sewer-cap.js'), /U\.idOf\(App\(\)\.state\.projects\)\}\|\$\{App\(\)\.state\.projects\.length\}\|\$\{U\.idOf\(App\(\)\.state\.whatifs\)\}/);
  assert.match(src('js/map-analysis.js'), /const k = `\$\{bc\.date\}\|\$\{window\.PeelUtil\.idOf\(App\(\)\.state\.projects\)\}/);
});

test('inputs: a timeline drag applies when it pauses or lets go; criteria recount after the typing stops', () => {
  const tl = src('js/timeline.js');
  assert.match(tl, /const dragTo = \(\) => \{ clearTimeout\(dragT\); dragT = setTimeout\(applyDrag, 120\); \};/);
  assert.match(tl, /tFrom\.onchange = tTo\.onchange = \(\) => \{ if \(dragT\) applyDrag\(\); \};/);
  const st = src('js/svc-tab.js');
  assert.match(st, /clearTimeout\(critPending\.t\); critPending\.t = setTimeout\(applyCrit, 350\);/);
  assert.match(st, /mountEl\.addEventListener\('change', e => \{ if \(e\.target\.dataset && e\.target\.dataset\.g && critPending\.t\) applyCrit\(\); \}\);/);
});
