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

test('offline: every script index.html loads is in the worker\'s shell, and ?v= requests find it', () => {
  const sw = src('sw.js'), html = src('index.html');
  const listed = new Set([...sw.matchAll(/'(js\/[^']+\.js)'/g)].map(m => m[1]));
  const used = [...new Set([...html.matchAll(/src="(js\/[^"?]+\.js)/g)].map(m => m[1]))];
  assert.deepEqual(used.filter(u => !listed.has(u)), [], 'scripts the page loads but the worker never caches');
  assert.match(sw, /await cache\.match\(request\)\.catch\(\(\) => null\) \|\| await cache\.match\(request, \{ ignoreSearch: true \}\)/);
});

test('share links: a link opens its own scenario, keeps its tab with a development, never waits for ever', () => {
  const s = src('js/share.js');
  assert.match(s, /App\(\)\.state\.basis = App\(\)\.DEFAULT_BASIS;\n      for \(const \[k, o, d\] of \[\['wm', 'ww', 'calibrated'\], \['md', 'md', 'design'\], \['dv', 'div', 'off'\], \['nr', 'nr', 'on'\]\]\) SVCT\(\)\.svcOpt\[o\] = q\.get\(k\) \|\| d;/);
  assert.match(s, /if \(d\) \{ DN\(\)\.showDetail\(d\); if \(q\.get\('t'\) \|\| pageWs\) AT\(\)\.showFootTab\(AT\(\)\.getFootPref\(\)\); \}/);
  assert.match(s, /if \(Date\.now\(\) - wait0 < 20000\)/);
  // (a plain visit is not a link: the stored settings stay)
  assert.match(s, /let pending = location\.hash\.length > 1 \? new URLSearchParams\(location\.hash\.slice\(1\)\) : null, applied = !pending/);
});

test('keys: the map keeps its arrows off its own controls; a handled Escape is not a "clear"; tour buttons; figures', () => {
  assert.match(src('js/map-keys.js'), /t\.closest\('input, select, textarea, button, \[contenteditable="true"\], \[role="slider"\], \.leaflet-control'\)\) return;/);
  const as = src('js/area-select.js');
  assert.match(as, /if \(e\.key === 'Escape' && lassoOn\) \{ pts = null; setLasso\(false\); e\.preventDefault\(\); \}/);
  assert.match(as, /if \(e\.key === 'Escape' && !e\.defaultPrevented && !Meas\(\)\.tool\.mode/);
  assert.match(src('js/topbar.js'), /\.some\(id => \{ const m = \$\(id\); return m && !m\.hidden; \}\)\) e\.preventDefault\(\);/);
  assert.match(src('js/tips.js'), /if \(e\.key === 'Enter' && e\.target && e\.target\.closest && e\.target\.closest\('\.tour-card button, \.tour-card a'\)\) return;/);
  assert.match(src('js/panel.js'), /e\.target\.classList\.contains\('pnl-row'\) \|\| e\.target\.classList\.contains\('pnl-fig'\)/);
});

test('the analysis column\'s handle follows a sideways drag', () => {
  assert.match(src('js/data-tab.js'), /const at = e => \(axis === 'x' \? e\.clientX : e\.clientY\);/);
  assert.match(src('js/app.js'), /dragResize\(\$\('#analysis-resize'\), \{\n    axis: 'x',/);
});

test('search: Enter uses the suggestions for what is in the box; a pick cancels a waiting update', () => {
  const s = src('js/search-filter.js');
  assert.match(s, /if \(sugFor !== q\) \{ clearTimeout\(sugTimer\); updateSug\(q\); \}/);
  assert.match(s, /clearTimeout\(sugTimer\); sugSeq\+\+; sugFor = null;/);
});

test('growth: Areas recount after a criteria edit; event years read in UTC; the estimate note counts what it uses', () => {
  assert.match(src('js/plan-tables.js'), /JSON\.stringify\(crit\), App\(\)\.state\.empGen \|\| 0, root\.PeelUtil\.idOf\(App\(\)\.state\.projects\)/);
  assert.match(src('js/app.js'), /map\(t => t\.date\.getUTCFullYear\(\)\)/);
  assert.match(src('js/timeline.js'), /const y = t\.date\.getUTCFullYear\(\);/);
  assert.match(src('js/areas.js'), /if \(c && c\.estimated && c\.date >= since\) estimated\+\+;/);
});

test('the empty-list helper leaves the filters and their controls as they were', () => {
  const f = src('js/filter-ui.js');
  assert.match(f, /lyr: App\(\)\.state\.lyr \? new Set\(App\(\)\.state\.lyr\) : null, ss: App\(\)\.state\.ss, tf: TL\(\)\.tFrom\.value, tt: TL\(\)\.tTo\.value/);
  assert.match(f, /SF\(\)\.syncFilterControls\(\); PA\(\)\.showArea\(\); SD\(\)\.showSvcArea\(\);/);
  assert.match(f, /\(!App\(\)\.state\.lyr \|\| App\(\)\.state\.lyr\.has\(App\(\)\.rungOf\(p\)\)\)/);
});

test('dedupe keeps a text-read unit count marked as one', () => {
  const P = require('../js/phases.js');
  const base = { municipality: 'Caledon', kind: 'application', ref: 'POPA 2022-0001', fileKey: 'x', status: 'Open', phase: 'review', events: [] };
  const out = P.dedupeRecords([{ ...base, units: null }, { ...base, units: 40, unitsFromText: true, description: 'unit count: 40' }]);
  assert.equal(out.length, 1); assert.equal(out[0].units, 40); assert.equal(out[0].unitsFromText, true);
});
