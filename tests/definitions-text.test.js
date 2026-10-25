'use strict';
// One meaning per term: "left to build", "committed" and persons per unit say what the code counts,
// on every surface that names them (README "Definitions (one table, used everywhere)").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const D = require('../js/demand.js');
function info() {
  const ctx = { window: {}, self: {} }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/info.js'), ctx);
  return (ctx.window.PeelInfo || ctx.PeelInfo).INFO;
}

test('"left to build" is planned minus completed wherever it is named; planned minus permitted is "left to permit"', () => {
  assert.match(src('js/render-list.js'), /left: \(a, b\) => P\.unbuiltOf\(b\) - P\.unbuiltOf\(a\)/, 'the Find list sorts by the figure its rows print');
  assert.match(src('js/exports.js'), /left_to_build: p\.buildout \? P\.unbuiltOf\(p\) : '', left_to_permit: p\.buildout \? p\.buildout\.remaining : ''/);
  assert.match(src('js/reports.js'), /\$\{fmtNum\(P\.unbuiltOf\(p\)\)\} left to build<\/td>/, 'the servicing memo');
  assert.doesNotMatch(src('js/area-select.js'), /'Left to build', [^\n]*no permit yet/, 'the selection tile of units with no permit is "Left to permit"');
  const I = info();
  for (const k of ['buildout', 'definitions', 'focus-left', 'demand-selection']) assert.doesNotMatch(I[k].body, /Left to build[^.]*no (building )?permit yet/i, k);
  assert.doesNotMatch(src('README.md'), /Left to\s+build\*\* counting basis \(planned units with no permit yet\)/);
});

test('"committed" is the Peel rule (a site servicing or building permit), the treatment plants alone MECP D-5-1', () => {
  const I = info();
  assert.match(I.definitions.body, /Committed \(the Peel rule\): units left to build that a water or wastewater site servicing permit/);
  assert.match(I.definitions.body, /treatment plants alone count past plan approval instead \(MECP Procedure D-5-1\)/);
  const L = require('../js/logic.js');
  const row = L.groups({ P: require('../js/phases.js'), D }).flatMap(g => g[3]).find(r => r[0] === 'Committed');
  assert.ok(row && row[1].includes(D.COMMIT_RULES.peel) && row[1].includes(D.COMMIT_RULES.d51), 'How the app decides names both rules');
  assert.match(src('js/reference.js'), /Committed follows MECP Procedure D-5-1 at the treatment plants and the Peel rule/);
});

test('info cards: persons per unit and flows are the values js/demand.js uses', () => {
  const I = info(), c = D.DEFAULT_CRITERIA;
  const ppu = I['demand-pop'].source;
  for (const s of [`single / semi ${c.ppu.single}`, `townhouse ${c.ppu.town}`, `apartment ${c.ppu.apartment}, or ${c.ppu.apartmentHigh} above ${D.APT_DENSITY} persons/ha`, `type not stated ${c.ppu.unknown}`]) assert.ok(ppu.includes(s), `persons per unit: ${s}`);
  const w = I['demand-water'].body;
  for (const s of [`${c.water.avg} L/cap/d`, `×${c.water.maxDay}`, `×${c.water.peakHour.toFixed(1)}`]) assert.ok(w.includes(s), `water: ${s}`);
  const ww = I['demand-wastewater'].body;
  for (const s of [`${c.wastewater.avg} L/cap/d`, `${c.wastewater.infiltration} L/s per hectare`, `between ${c.wastewater.peakMin.toFixed(1)} and ${c.wastewater.peakMax.toFixed(1)}`]) assert.ok(ww.includes(s), `wastewater: ${s}`);
});
