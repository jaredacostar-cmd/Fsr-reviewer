'use strict';
// The Size and Land-use filters test the units a development shows (p.units), not its largest
// single application (js/app.js unitsFor / sizeMatch / LANDUSE_TEST.growth). js/app.js is a
// browser IIFE, so the functions are read from its source and run on synthetic developments.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const grab = re => { const m = re.exec(SRC); assert.ok(m, `${re} not found in js/app.js`); return m[0]; };
const unitsForSrc = grab(/function unitsFor\(p\) \{[\s\S]*?\n {2}\}/);
const sizeSrc = grab(/const sizeMatch = [^\n]*;/);
const growthSrc = grab(/ {4}growth: [^\n]*,/).trim().replace(/^growth: /, '').replace(/,$/, '');
const growthUnstatedSrc = grab(/const GROWTH_TEXT = [\s\S]*?const growthUnstated = [\s\S]*?\)\)\);/);
function make(state, jobs = () => 0) {
  const P = { stageOf: () => 'siteplan' };
  return new Function('state', 'jobsOf', 'P', `${unitsForSrc}\n${sizeSrc}\n${growthUnstatedSrc}\nreturn { unitsFor, sizeMatch, growth: ${growthSrc} };`)(state, jobs, P);
}
const app = (units) => ({ kind: 'application', phase: 'review', units, description: '', type: 'Site plan' });
const dev = (units, records, extra = {}) => ({ units, records, kinds: [...new Set(records.map(r => r.kind))], ...extra });

test('Size: a development showing 9,961 units passes "500+ units" though no one application states 500', () => {
  const p = dev(9961, [app(null), app(120)]);
  for (const min of [10, 50, 100, 500]) assert.ok(make({ kind: 'application', minUnits: min }).sizeMatch(p), `${min}+`);
  const small = dev(40, [app(400)]);   // its tree counts 40 (the 400 counted elsewhere)
  assert.ok(!make({ kind: 'application', minUnits: 100 }).sizeMatch(small), 'the shown 40 is under 100');
});

test('Size: with "Planning applications", a site with permits only counts none', () => {
  const permitsOnly = dev(12, [{ kind: 'permit', units: 12 }]);
  assert.equal(make({ kind: 'application', minUnits: 10 }).unitsFor(permitsOnly), 0);
  assert.equal(make({ kind: '', minUnits: 10 }).unitsFor(permitsOnly), 12, 'all records: its units');
});

test('Size "Adds units or jobs": units or jobs', () => {
  const s = { kind: 'application', minUnits: 1 };
  assert.ok(make(s).sizeMatch(dev(3, [app(null)])), 'units');
  assert.ok(make(s, () => 250).sizeMatch(dev(0, [app(null)])), 'jobs, no units');
  assert.ok(!make(s).sizeMatch(dev(0, [app(null)])), 'neither');
});

test('Land use "Adds units or jobs": the units shown, or jobs, on a development with a planning application', () => {
  const s = { kind: 'application', minUnits: 0 };
  assert.ok(make(s).growth(dev(25, [app(null)])), 'units from the tree / build-out, no application states them');
  assert.ok(make(s, () => 80).growth(dev(0, [app(null)])), 'jobs');
  assert.ok(!make(s).growth(dev(0, [app(null)])), 'nothing');
  assert.ok(!make(s).growth(dev(6, [{ kind: 'permit', units: 6 }])), 'permits only: not a proposal');
  const unstated = dev(0, [{ ...app(null), type: 'Draft plan of subdivision', description: 'draft plan of subdivision for townhouses' }]);
  assert.ok(make(s).growth(unstated), 'a growth proposal whose count is not published yet stays');
});
