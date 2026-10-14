'use strict';
// Capital schedule currency (design audit, Group 3): status after the May 2026 pause, "as of",
// and one dollar year.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const U = require('../js/util.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

test('capital status: proposed is paused, the 2026 budget is unknown, overrides win', () => {
  assert.equal(U.capitalStatus(2030, 'proposed', '25-1234'), 'paused');
  assert.equal(U.capitalStatus(2027, '', null), 'paused');
  assert.equal(U.capitalStatus(2026, 'approved', '22-2255'), 'unknown');
  assert.equal(U.capitalStatus(2028, 'approved', null), 'unknown', 'in the 2026 budget, later in service');
  assert.equal(U.capitalStatus(2024, '', null), 'scheduled');
  U.CAPITAL.overrides['22-2255'] = 'scheduled';
  try { assert.equal(U.capitalStatus(2026, 'approved', '22-2255'), 'scheduled'); } finally { delete U.CAPITAL.overrides['22-2255']; }
  assert.deepEqual(Object.keys(U.CAPITAL_STATUS), ['scheduled', 'paused', 'unknown']);
});

test('the pause note names the date, the as-of and the source', () => {
  const n = U.pauseNote();
  assert.match(n, /as of March 2026/);
  assert.match(n, /June 11, 2026/);
  assert.match(n, /escribemeetings/);
  assert.match(U.capitalChip('paused'), /Paused/);
});

test('one dollar year: indexing at the average annual rate', () => {
  assert.equal(U.DOLLAR_YEAR, 2026);
  assert.equal(U.toDollarYear(100, 2020, 1.4), 100 * 1.4);
  assert.equal(U.toDollarYear(100, 2026, 1.4), 100);
  const v = U.toDollarYear(130e6, 2024, 1.4024);
  assert.ok(v > 130e6 * 1.11 && v < 130e6 * 1.13, `2024$ → 2026$: ${v}`);
});

test('every DC cost is in 2026$ and every planned date carries status and as-of', () => {
  const dca = src('dca-tab.js'), dc = src('dc-cost.js'), mp = src('masterplan.js'), rep = src('reports.js'), inf = src('dc-infra.js');
  assert.doesNotMatch(dca + rep, /2020\$/, 'no 2020$ figures left on the DC tab or the briefing');
  assert.match(dca, /<th>Cost \(2026\$\)<\/th>/);
  assert.match(dc, /gross \+= c\.gross \* ix; dc \+= c\.dc \* ix;/, 'timing costs indexed');
  assert.match(dc, /toDollarYear\(sc\.gross, sc\.year/, 'plant step cost indexed from its own year');
  assert.match(dca, /Online <small>draft, as of \$\{CAPITAL\.asOf\}<\/small>/);
  assert.equal((dca.match(/pauseNote\(\)/g) || []).length, 3, 'pause note on the three DC sub-views');
  assert.match(dca, /'Capital status \(May 2026 pause\)'/, 'CSV status column');
  assert.equal((mp.match(/\$\{capTag\(/g) || []).length, 3, 'line, facility and plant-step relief texts');
  assert.match(rep, /pauseNote\(\)/);
  assert.match(inf, /lnStatus\(ln\)/);
});
