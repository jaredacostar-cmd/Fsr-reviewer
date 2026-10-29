const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));

test('MECP plant flows: three plants, full years, matching the Region\'s reports', () => {
  const d = read('plant-flows.json');
  for (const pl of ['Lakeview', 'Clarkson', 'Inglewood']) {
    const p = d.plants[pl];
    assert.ok(p && Object.keys(p.annual).length >= 10, `${pl} years`);
    for (const [y, a] of Object.entries(p.annual)) {
      assert.ok(a.months >= 1 && a.months <= 12, `${pl} ${y} months`);
      assert.ok(a.wettestMonthMLd >= a.avgMLd, `${pl} ${y} wettest month ≥ average`);
      assert.ok(a.avgMLd > 0 && a.avgMLd < p.ratedMLd * 1.5, `${pl} ${y} plausible`);
    }
  }
  assert.ok(Math.abs(d.plants.Lakeview.annual['2024'].avgMLd - 452.06) < 0.5, 'Lakeview 2024');
  assert.ok(d.checks.length >= 6, 'checked against the annual reports');
  for (const c of d.checks) assert.ok(Math.abs(c.diffPct) <= 1, `${c.plant} ${c.year} within 1% (${c.diffPct})`);
  assert.ok(d.steps.some(s => s.date === '2025-03-12' && s.from === 'Lakeview' && s.to === 'Clarkson'), 'diversion step');
});

test('plant flow chart and summary render from the data', () => {
  global.window = { PeelApp: { state: { plantFlows: read('plant-flows.json') } } };
  delete require.cache[require.resolve('../js/plant-flows.js')];
  require('../js/plant-flows.js');
  const PF = global.window.PeelPlantFlows;
  const svg = PF.chartHTML('Lakeview');
  assert.match(svg, /<svg class="dca-chart pf-chart"/);
  assert.match(svg, /rated 518/);
  assert.match(svg, /90% trigger/);
  assert.match(svg, /flow moved to Clarkson/);
  assert.match(PF.summary('Clarkson'), /two lake plants together/);
  assert.doesNotMatch(PF.summary('Inglewood'), /two lake plants/);
  assert.equal(PF.chartHTML('Toronto'), '');
  assert.match(global.window.ModelChecks.plantFlows.html, /Matches/);
  // A plant's own Records › Data checks (navigation phase 8a): its rows only; '' for a plant the file does not check.
  const rowsOf = h => [...h.matchAll(/<tr><td>([^<]+) \d{4}<\/td>/g)].map(m => m[1]);
  assert.ok(rowsOf(PF.checksHTML('Clarkson')).length >= 5 && rowsOf(PF.checksHTML('Clarkson')).every(n => n === 'Clarkson'), 'Clarkson rows only');
  assert.equal(PF.checksHTML('Inglewood'), '');
  assert.deepEqual([...new Set(rowsOf(PF.checksHTML()))], ['G.E. Booth', 'Clarkson'], 'no plant: every row, as before');
  assert.equal(PF.checksHTML(), global.window.ModelChecks.plantFlows.html);
  delete global.window;
});
