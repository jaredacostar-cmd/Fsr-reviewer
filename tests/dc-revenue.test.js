'use strict';
/* SPEC 1.9: DC revenue never uses the cheapest rate silently. Without stated unit types it shows a
 * range (all small apartments → all townhouses); an employment or mixed site gets a non-residential
 * row per m² of floor area, marked [ADD RATE] until data/dc-costs.json carries the rate. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const costs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dc-costs.json'), 'utf8'));

function load(rates, emp) {
  const win = {};
  const ctx = vm.createContext({ window: win, console, Intl, Math, JSON, Set, Map });
  win.window = win;
  vm.runInContext(JS('util.js'), ctx);
  vm.runInContext(JS('demand.js'), ctx);
  const D = win.PeelDemand;
  win.PeelApp = { state: { criteria: JSON.parse(JSON.stringify(D.DEFAULT_CRITERIA)), dcCosts: { rates } }, jobsOf: () => 0, empOf: p => emp(p) };
  vm.runInContext(JS('dc-cost.js'), ctx);
  win.PeelDcCost.fmtMoney = win.PeelUtil.fmtMoney;
  return win.PeelDcCost;
}
const dev = (units, unitMix, extra = {}) => ({ ref: 'X', units, unitMix, types: [], description: '', records: [], phase: 'review', ...extra });

test('unit types not stated: a range from all small apartments to all townhouses', () => {
  const C = load(costs.rates, () => null), r = costs.rates;
  const one = r.single.water + r.single.wastewater;
  const html = C.dcRevenueHTML(dev(100, null));
  assert.ok(!C.mixStated(dev(100, null)));
  assert.match(html, /Unit types are not stated/);
  const lo = C.fmtMoney(100 * one * r.ratio2020.apartmentSmall), hi = C.fmtMoney(100 * one * r.ratio2020.other);
  assert.ok(html.includes(`${lo} – ${hi}`), `range ${lo} – ${hi}`);
  assert.ok(!/≈\$/.test(html.split('dcrev-nonres')[0]), 'no single point estimate');
});

test('unit types stated: the itemised estimate, no range', () => {
  const C = load(costs.rates, () => null);
  const p = dev(100, { single: 40, town: 60 });
  assert.ok(C.mixStated(p));
  const html = C.dcRevenueHTML(p);
  assert.doesNotMatch(html, /not stated/);
  assert.match(html, /dcrev-t/);
});

test('employment site: non-residential row, [ADD RATE] when the rate is missing', () => {
  const C = load(costs.rates, () => ({ totalM2: 12000, jobs: 300 }));
  const html = C.dcRevenueHTML(dev(0, null));
  assert.match(html, /Non-residential water &amp; wastewater DCs/);
  assert.match(html, /12,000 m²/);
  if (!costs.rates.nonResidential) assert.match(html, /\[ADD RATE\]/);
});

test('employment site with a rate: m² × (water + wastewater)', () => {
  const rates = { ...costs.rates, nonResidential: { water: 20, wastewater: 30 } };
  const C = load(rates, () => ({ totalM2: 1000 }));
  const html = C.dcNonResHTML(dev(0, null));
  assert.match(html, /50,000/);
  assert.doesNotMatch(html, /ADD RATE/);
});

test('mixed site: residential DCs plus the non-residential row', () => {
  const C = load(costs.rates, () => ({ totalM2: 5000 }));
  const html = C.dcRevenueHTML(dev(200, { apartment: 200 }));
  assert.match(html, /Regional water &amp; wastewater DCs/);
  assert.match(html, /dcrev-nonres/);
});

test('residential site: no non-residential row', () => {
  const C = load(costs.rates, () => null);
  assert.doesNotMatch(C.dcRevenueHTML(dev(50, null)), /dcrev-nonres/);
});
