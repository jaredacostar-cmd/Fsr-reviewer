'use strict';
// The developments table and treemap (js/dev-table.js): Growth in an area's developments in one table,
// grouped and sorted; the treemap under the map; both open the site and ring it on the map.
const test = require('node:test');
const assert = require('node:assert/strict');
const DT = require('../js/dev-table.js');

const STAGES = [['proposed', 'In review'], ['approved', 'Approved, no permit yet'], ['permitted', 'Permit issued']];
const row = (key, o = {}) => ({ key, title: key, st: 'proposed', share: 1, units: 100, left: 100, ss: 'none', last: Date.UTC(2025, 5, 1), where: 'Alloa', hx: 10, hy: 20, ...o });
const opts = groups => ({ title: 'Developments in Caledon', groups, by: 'area', byOpts: [['area', 'Plan'], ['stage', 'Stage']], sort: { k: 'l', dir: -1 }, where: false, stages: STAGES, stageLabel: k => k, ssLabel: k => k });

test('squarify: the boxes fill the rectangle, each in proportion to its value', () => {
  const out = DT.squarify([{ v: 6 }, { v: 3 }, { v: 1 }], 0, 0, 100, 100);
  assert.equal(out.length, 3);
  const area = out.reduce((t, b) => t + b.w * b.h, 0);
  assert.ok(Math.abs(area - 10000) < 1e-6);
  for (const [b, v] of out.map((b, i) => [b, [6, 3, 1][i]])) assert.ok(Math.abs(b.w * b.h - v * 1000) < 1e-6);
  for (const b of out) assert.ok(b.x >= -1e-9 && b.y >= -1e-9 && b.x + b.w <= 100 + 1e-6 && b.y + b.h <= 100 + 1e-6);
  assert.deepEqual(DT.squarify([], 0, 0, 100, 100), []);
});

test('sortRows: by a column either way; ties by left to build', () => {
  const rs = [row('b', { units: 5, left: 1 }), row('a', { units: 9, left: 2 }), row('c', { units: 5, left: 3 })];
  assert.deepEqual(DT.sortRows(rs, { k: 'l', dir: -1 }).map(r => r.key), ['c', 'a', 'b']);
  assert.deepEqual(DT.sortRows(rs, { k: 'u', dir: 1 }).map(r => r.key), ['c', 'b', 'a']);
  assert.deepEqual(DT.sortRows(rs, { k: 't', dir: 1 }).map(r => r.key), ['a', 'b', 'c']);
});

test('the table: a group heading opens its level, a row opens the site and rings it on the map', () => {
  const html = DT.tableHTML(opts([{ key: 'sp:a', name: 'Alloa', sub: 'secondary plan', drill: 'sp:a', open: true, rows: [row('Caledon|1 A RD'), row('Caledon|2 B RD', { st: 'approved', left: 40 })] }, { key: 'sp:b', name: 'Bolton', drill: 'sp:b', open: false, rows: [row('Caledon|3 C RD')] }]));
  assert.match(html, /<button type="button" class="gt-tog" data-gt-tog="sp:a" aria-expanded="true">/);
  assert.match(html, /data-ws-drill="sp:a" title="Open Alloa">Open →/);
  assert.match(html, /<tr class="gt-r" data-ws-pick="Caledon\|1 A RD" data-ws-as="site" data-hx="10" data-hy="20">/);
  assert.match(html, /secondary plan · 2 developments · 200 units/);
  assert.match(html, /<b>140<\/b> <small class="muted">left/);
  assert.doesNotMatch(html, /data-ws-pick="Caledon\|3 C RD"/, 'a closed group shows its heading only');
  assert.match(html, /data-gt-by="area" aria-pressed="true"/);
  assert.match(html, /aria-sort="descending"><button type="button" class="gt-sort" data-gt-sort="l">Left to build ↓/);
});

test('the table: ten rows a group, then Show all', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(`k${i}`, { left: 100 - i }));
  const html = DT.tableHTML(opts([{ key: 'g', name: 'G', open: true, rows }]));
  assert.equal((html.match(/class="gt-r"/g) || []).length, DT.ROWS);
  assert.match(html, /data-gt-more="g">Show all 12/);
  const all = DT.tableHTML(opts([{ key: 'g', name: 'G', open: true, all: true, rows }]));
  assert.equal((all.match(/class="gt-r"/g) || []).length, 12);
});

test('the treemap: a box per area (it opens the level), a tile per development (it opens the site)', () => {
  const tiles = [row('Caledon|1 A RD', { v: 300 }), row('Caledon|2 B RD', { v: 100, st: 'approved', hx: null })];
  const html = DT.treemapHTML([{ key: 'sp:a', name: 'Alloa', drill: 'sp:a', area: 'sp:caledon:alloa', tiles }, { key: 'sp:b', name: 'Bolton', drill: 'sp:b', tiles: [row('Caledon|3 C RD', { v: 50 })] }], { stageLabel: k => k });
  assert.match(html, /data-tm-box="sp:a" data-tm-area="sp:caledon:alloa"/);
  assert.match(html, /class="gtm-t ly-proposed" style="[^"]+" data-ws-pick="Caledon\|1 A RD" data-ws-as="site" data-hx="10" data-hy="20"/);
  assert.match(html, /data-ws-pick="Caledon\|2 B RD" data-ws-as="site" title=/, 'no point: no ring');
  assert.match(html, /data-ws-drill="sp:a" title="Open Alloa">Alloa · 400/);
  // Past the cap: the rest as one tile.
  const many = DT.treemapHTML([{ key: 'm', name: 'M', tiles: Array.from({ length: 5 }, (_, i) => row(`k${i}`, { v: 10 - i })) }], { cap: 3 });
  assert.equal((many.match(/data-ws-pick=/g) || []).length, 3);
  assert.match(many, /title="2 smaller developments · 13 left"/);
  assert.equal(DT.treemapHTML([{ key: 'z', name: 'Z', tiles: [] }]), '');
});

test('a row: its short name, then its stage, area (when the groups are not areas), servicing permit and share', () => {
  assert.equal(DT.short('12561 CENTREVILLE CREEK ROAD CALEDON ON L7C 3B7'), '12561 CENTREVILLE CREEK ROAD');
  assert.equal(DT.short('50 ANN STREET, CALEDON, ON, L7E 1B9'), '50 ANN STREET');
  assert.equal(DT.short('Lakeshore / Aerodrome block'), 'Lakeshore / Aerodrome block');
  const g = [{ key: 'g', name: 'G', open: true, rows: [row('Caledon|1 A RD CALEDON ON', { title: '1 A RD CALEDON ON', share: 0.31, ss: 'counted' })] }];
  const byStage = DT.tableHTML({ ...opts(g), by: 'stage', where: true });
  assert.match(byStage, /title="Check 1 A RD CALEDON ON">1 A RD<\/button><small class="gt-line"><span class="gt-stage"><i class="gt-dot ly-proposed" aria-hidden="true"><\/i>proposed<\/span> · Alloa · <span class="gt-ss t-counted">counted<\/span> · 31% here<\/small>/);
  assert.doesNotMatch(DT.tableHTML(opts(g)), / · Alloa · /, 'grouped by area: the area is the heading');
});
