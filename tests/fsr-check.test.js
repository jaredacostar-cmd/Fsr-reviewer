'use strict';
/* Phase 7 FSR cross-check tests: js/fsr-check.js pure logic in Node.
 * The module is browser code guarded for Node (no DOM access at load); here we
 * exercise the comparison / flag / threshold functions it exports.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const F = require('../js/fsr-check.js');

const APP = {
  population: 1000, jobs: 20,
  waterAvg: 3.0, waterMaxDay: 5.4, waterPeakHour: 9.0,
  wwAvg: 3.4, wwPeak: 10.2, wwWetPeak: 11.5,
  zoneFull: 'Pressure zone 5', catchmentFull: 'G.E. Booth · Block 12 outlet',
  plantFull: 'G.E. Booth Water Resource Recovery Facility',
};

test('exports the comparison/flag contract and the thresholds', () => {
  for (const k of ['toNum', 'normCon', 'pctDiff', 'flagFor', 'fmtDiff', 'zoneMatch', 'flowRows', 'connRows', 'pipeChecks', 'plantCheck', 'dcCheck', 'summarize', 'verdictOf', 'toggleFor'])
    assert.equal(typeof F[k], 'function', k);
  assert.equal(F.WARN_PCT, 10);
  assert.equal(F.BAD_PCT, 25);
});

test('toNum parses form input', () => {
  assert.equal(F.toNum('1,234'), 1234);
  assert.equal(F.toNum(' 3.5 '), 3.5);
  assert.equal(F.toNum(''), null);
  assert.equal(F.toNum(null), null);
  assert.equal(F.toNum('abc'), null);
  assert.equal(F.toNum('0'), 0);
});

test('normCon splits numeric and text fields', () => {
  const c = F.normCon({ population: '1,000', waterAvg: '3.2', waterMaxDay: '', zone: ' Zone 5 ', sewerConn: '  ' });
  assert.equal(c.population, 1000);
  assert.equal(c.waterAvg, 3.2);
  assert.equal(c.waterMaxDay, null);
  assert.equal(c.zone, 'Zone 5');
  assert.equal(c.sewerConn, null);
});

test('pctDiff: signed % difference, nulls and the zero-app edge', () => {
  assert.equal(F.pctDiff(110, 100), 10);
  assert.equal(F.pctDiff(90, 100), -10);
  assert.equal(F.pctDiff(100, 100), 0);
  assert.equal(F.pctDiff(null, 100), null);
  assert.equal(F.pctDiff(100, null), null);
  assert.equal(F.pctDiff(0, 0), 0);
  assert.equal(F.pctDiff(5, 0), Infinity);
});

test('flagFor: 10% amber boundary, 25% red boundary', () => {
  assert.equal(F.flagFor(0), 'ok');
  assert.equal(F.flagFor(10), 'ok');
  assert.equal(F.flagFor(-10), 'ok');
  assert.equal(F.flagFor(10.1), 'warn');
  assert.equal(F.flagFor(-24.9), 'warn');
  assert.equal(F.flagFor(25), 'warn');
  assert.equal(F.flagFor(25.1), 'bad');
  assert.equal(F.flagFor(-40), 'bad');
  assert.equal(F.flagFor(Infinity), 'bad');
  assert.equal(F.flagFor(null), 'na');
  assert.equal(F.flagFor(NaN), 'na');
});

test('fmtDiff formats the difference', () => {
  assert.equal(F.fmtDiff(12.34), '+12.3%');
  assert.equal(F.fmtDiff(-4), '−4.0%');
  assert.equal(F.fmtDiff(0), '0.0%');
  assert.equal(F.fmtDiff(null), 'n/a');
});

test('flowRows: consultant vs app with % difference and flags', () => {
  const con = { population: 1000, waterAvg: 3.0, waterMaxDay: 6.2, waterPeakHour: null, wwAvg: 3.4, wwPeak: 10.2, wwWetPeak: 20 };
  const rows = F.flowRows(con, APP);
  assert.equal(rows.length, 7);
  const by = k => rows.find(r => r.key === k);
  assert.equal(by('population').flag, 'ok');
  assert.equal(by('population').diff, 0);
  assert.equal(by('waterAvg').flag, 'ok');
  const md = by('waterMaxDay');
  assert.ok(Math.abs(md.diff - (6.2 - 5.4) / 5.4 * 100) < 1e-9);
  assert.equal(md.flag, 'warn'); // +14.8%
  assert.equal(by('waterPeakHour').flag, 'na');
  assert.equal(by('waterPeakHour').diff, null);
  const wp = by('wwWetPeak');
  assert.ok(Math.abs(wp.diff - (20 - 11.5) / 11.5 * 100) < 1e-9);
  assert.equal(wp.flag, 'bad'); // +73.9%
  // Missing app figure is also na.
  const rows2 = F.flowRows(con, { ...APP, wwAvg: null });
  assert.equal(rows2.find(r => r.key === 'wwAvg').flag, 'na');
});

test('zoneMatch: zone spellings compare equal', () => {
  assert.equal(F.zoneMatch('Pressure zone 5', 'Zone 5'), true);
  assert.equal(F.zoneMatch('zone 5', '5'), true);
  assert.equal(F.zoneMatch('Pressure Zone 5', 'pressure zone 5'), true);
  assert.equal(F.zoneMatch('Zone 5', 'Zone 6'), false);
  assert.equal(F.zoneMatch('Zone 5', null), null);
  assert.equal(F.zoneMatch('', 'Zone 5'), null);
});

test('connRows: zone auto-compared, sewer connection always manual', () => {
  const [z, s] = F.connRows({ zone: 'Zone 5', sewerConn: 'MH-12' }, APP);
  assert.equal(z.flag, 'ok');
  assert.equal(z.label, 'Pressure zone');
  assert.equal(s.flag, 'manual');
  assert.equal(s.con, 'MH-12');
  assert.equal(s.app, APP.catchmentFull);
  const [z2] = F.connRows({ zone: 'Zone 6', sewerConn: null }, APP);
  assert.equal(z2.flag, 'bad');
  const [z3] = F.connRows({ zone: null }, APP);
  assert.equal(z3.flag, 'na');
});

test('pipeChecks: local + trunk bands follow the map legend', () => {
  const out = F.pipeChecks({ local: { p: [450], r1: 0.9 }, trunk: { p: [900], r1: 1.05 } });
  assert.equal(out.length, 2);
  assert.equal(out[0].flag, 'warn');
  assert.equal(out[0].pct, 90);
  assert.match(out[0].label, /450 mm/);
  assert.equal(out[1].flag, 'bad');
  const ok = F.pipeChecks({ local: { p: [300], r1: 0.5 }, trunk: null });
  assert.equal(ok.length, 1);
  assert.equal(ok[0].flag, 'ok');
  assert.deepEqual(F.pipeChecks(null), []);
  assert.deepEqual(F.pipeChecks({}), []);
});

test('plantCheck: reserve, over-commitment and missing figures', () => {
  const ok = F.plantCheck({ name: 'G.E. Booth', reserve: 40, use: 4 });
  assert.equal(ok.flag, 'ok');
  assert.match(ok.text, /40/);
  assert.match(ok.text, /10\.0%/);
  const bad = F.plantCheck({ name: 'G.E. Booth', reserve: -2, use: 4 });
  assert.equal(bad.flag, 'bad');
  assert.match(bad.text, /over-committed/);
  assert.equal(F.plantCheck(null).flag, 'na');
  assert.equal(F.plantCheck({}).flag, 'na');
});

test('dcCheck: the "relies on DC works" gap is red, needBy alone is amber', () => {
  const [g] = F.dcCheck({ gap: true, needBy: 2031, trunks: [] });
  assert.equal(g.level, 'bad');
  assert.match(g.text, /2031/);
  const [n] = F.dcCheck({ gap: false, needBy: 2030, trunks: [] });
  assert.equal(n.level, 'warn');
  assert.match(n.text, /2030/);
  assert.deepEqual(F.dcCheck({ gap: false, needBy: 0, trunks: [] }), []);
  const withTrunk = F.dcCheck({ gap: false, needBy: 0, trunks: [{ y: 2032, d: 1200, p: 'WW-14' }] });
  assert.equal(withTrunk.length, 1);
  assert.equal(withTrunk[0].level, 'info');
  assert.match(withTrunk[0].text, /2032/);
  assert.equal(F.dcCheck(null)[0].level, 'na');
});

test('summarize + verdictOf count flags into a one-liner', () => {
  const rows = [
    { flag: 'ok' }, { flag: 'ok' }, { flag: 'warn' }, { flag: 'bad' }, { flag: 'na' }, { flag: 'manual' },
  ];
  const s = F.summarize(rows);
  assert.deepEqual(s, { ok: 2, warn: 1, bad: 1, na: 1, manual: 1 });
  const v = F.verdictOf(s);
  assert.match(v, /1 differ by more than 25%/);
  assert.match(v, /1 differ 10–25%/);
  assert.match(v, /2 match within 10%/);
  assert.match(v, /1 not entered/);
  assert.equal(F.verdictOf(null), '');
});
