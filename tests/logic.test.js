'use strict';
// How the app decides (js/logic.js): the data rules, gates and back-end decisions on one Reference
// page, each value read from the module that applies it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const L = require('../js/logic.js');
const P = require('../js/phases.js');
const D = require('../js/demand.js');
const C = require('../js/capacity.js');
const G = require('../js/dc-gate.js');
const A = require('../js/aerial.js');
const AC = require('../js/accuracy.js');
const T = require('../js/tree.js');

const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const MODS = { P, D, C, G, A, AC, DC: { CLOSE_YEARS: 2 }, DI: { DC_CONNECT_M: 1000 } };

test('the page: stages, joins, the DC gate, demand, capacity, timing, aerial and freshness, each rule with its value and where it is set', () => {
  const m = L.page(MODS);
  assert.equal(m.id, 'logic');
  assert.equal(m.eyebrow, 'Help');
  assert.deepEqual(L.groups(MODS).map(g => g[0]), ['stages', 'joins', 'dcgate', 'demand', 'capacity', 'timing', 'aerial', 'fresh']);
  for (const g of L.groups(MODS)) for (const r of g[3]) { assert.equal(r.length, 4, r[0]); assert.ok(r[3], `${r[0]}: where it is set`); }
  assert.match(m.method, /must validate or confirm all results/);
  // (navigation phase 7, design §3.7, §5 row 171: the number conventions, Settings' until now, after the groups, in the
  // contents line too; the sources it names are Records › Sources, their one name)
  assert.match(m.mid, /<section class="rf" id="lg-numbers" data-psec="numbers"><h3 class="ws-h">Number conventions<\/h3><p class="small">People and jobs are estimates and are rounded the same way everywhere: [^<]*≈ marks a screening estimate\.<\/p><\/section>$/);
  assert.match(m.mid, /data-lg-go="numbers">Number conventions<\/button><\/p><\/nav>/);
  assert.deepEqual(m.actions[0], { label: 'Records › Sources', attrs: { 'data-ws-page': 'data' }, primary: true });
  assert.doesNotMatch(strip(m.mid), /Data sources|Reference/);
});

test('values come from the code: change a constant and the page follows', () => {
  const t = strip(L.page(MODS).mid);
  assert.ok(t.includes(`${Math.round(C.TRIGGER * 100)}% of rated capacity`));
  assert.ok(t.includes(`within ${P.CONTAINER_NEAR_M} m`));
  assert.ok(t.includes(`up to ${P.SMALL_SITE_UNITS} units`));
  assert.ok(t.includes(`within ${P.NEAR_PERMIT_M} m, ${P.NEAR_PERMIT_MIN_UNITS}+ units`));
  assert.ok(t.includes(`single ${D.DEFAULT_CRITERIA.ppu.single}`));
  assert.ok(t.includes(`I&I ${D.DEFAULT_CRITERIA.wastewater.infiltration} L/s/ha`));
  for (const b of Object.values(G.BUCKETS)) assert.ok(t.includes(b.label), b.label);
  for (const [k, v] of Object.entries(P.DORMANT_YEARS)) assert.ok(t.includes(`${P.PHASE_BY_KEY[k].label}: ${v} years`), k);
  assert.ok(t.includes(`at ${Math.round(AC.AERIAL_RULE.threshold * 100)}%+`));
  const t2 = strip(L.page({ ...MODS, C: { TRIGGER: 0.85 } }).mid);
  assert.ok(t2.includes('85% of rated capacity'));
  // A missing module shows – rather than a stale number.
  assert.ok(strip(L.page({}).mid).includes('Expansion trigger – '));
});

test('the build-side rules match the code they describe', () => {
  assert.equal(L.TREE_REF_MAX_M, T.REF_MAX_M);
  assert.match(src('js/dc-cost.js'), /const CLOSE_YEARS = 2;/);
  assert.match(src('js/dc-infra.js'), /const DC_CONNECT_M = 1000;/);
  assert.match(src('js/dc-gate.js'), /const GRACE_MS = 90 \* 864e5;/);
  assert.match(src('js/util.js'), /const PIPE_RESULTS = false;/);
});

test('reached from Help: the bar, Home’s sidebar entry, How it works, and loaded with the app', () => {
  assert.match(src('js/sections.js'), /\{ id: 'logic', title: 'How the app decides', page: 'logic' \}/);
  assert.match(src('js/workspaces.js'), /logic: \{ label: 'How the app decides', what: /);
  assert.match(src('js/ws-pages.js'), /const logic = \(\) => \(root\.PeelLogic \? root\.PeelLogic\.page\(\) : loading\('logic', 'Loading…'\)\);/);
  assert.match(src('js/reference.js'), /go\('logic', /);
  assert.match(src('index.html'), /<script src="js\/logic\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/logic\.js',/);
});
