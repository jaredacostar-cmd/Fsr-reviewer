#!/usr/bin/env node
/*
 * Pipeline ledger, Phase 3: backtest of the expected years (js/timing.js backtest) → docs/ledger/backtest.md.
 *
 * For each past start date, the sites as they stood then (the furthest stage each had entered, not yet
 * built) are timed by the time-in-stage curves built from what was known then, and scored against the
 * year each actually first completed. Only municipalities that date their completions can be checked
 * (Mississauga). Two curve sets are compared: the municipalities that date completions (what the app
 * uses since 2026-10-22) and every municipality pooled (before).
 *
 *   node scripts/backtest-ledger.js [--out docs/ledger/backtest.md]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../js/timing.js');
const { loadAppDevs } = require('./app-devs.js');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(ROOT, 'docs', 'ledger', 'backtest.md')));
const START_YEARS = [2019, 2020, 2021, 2022];

const { projects } = loadAppDevs(path.join(ROOT, 'data'));
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'snapshot.json'), 'utf8'));
const now = Date.parse(snap.generatedAt);
const dated = T.datedMunis(projects);
const pct = (a, b) => (b ? `${Math.round(a / b * 100)}%` : '–');
const n = v => v.toLocaleString('en-CA');

const rows = [];
for (const y of START_YEARS) {
  const asOf = Date.UTC(y, 0, 1);
  const used = T.backtest(projects, asOf, { now, testMunis: dated, curveMunis: dated });
  const pooled = T.backtest(projects, asOf, { now, testMunis: dated });
  rows.push({ y, used, pooled });
}
const line = (label, r) => `| ${label} | ${n(r.sites)} | ${n(r.judged)} | ${pct(r.inRange, r.judged)} | ${pct(r.unitsInRange, r.unitsJudged)} | ${pct(r.within1, r.judged)} | ${r.medianError == null ? '–' : (r.medianError > 0 ? `+${r.medianError}` : r.medianError)} | ${n(r.beyond)} | ${n(r.open)} |`;
const sum = k => rows.reduce((t, r) => t + r.used[k], 0);

const md = `# Pipeline ledger: backtest of the expected years

Written by \`node scripts/backtest-ledger.js\` from the snapshot of ${snap.generatedAt.slice(0, 10)}. Phase 3 of
\`docs/pipeline-ledger-plan.md\`.

## How it is done

For each start date (Jan 1 of ${START_YEARS[0]} to ${START_YEARS[START_YEARS.length - 1]}), every site as it stood then (the furthest stage it had
entered, not yet built) is timed by the time-in-stage curves built only from what was known that day:
completions after it count as not yet happened. Its predicted first-completion year (likely, and the range
from the fast to the slow band) is compared with the year it actually first completed.

- **Checked**: only municipalities that date their completions: ${[...dated].join(', ')}. Brampton and Caledon
  publish no completion dates, so their sites can't be scored.
- **Judged**: a site that finished by the snapshot date, or one whose likely year has passed without it
  finishing (a miss, at least as late as today). A site still waiting with its likely year still ahead
  can't be judged yet ("open").
- **No year**: the site had already waited longer than any similar site in the history known then. The
  app times these by the homes the population projection needs, which the backtest does not score.
- **What is scored is the first completion.** The ledger's year is when half a development's homes are
  done, which for a large site comes later; large sites are few, so the site counts are mostly small ones.
  The unit-weighted column gives large sites their weight.

## Results

The curves the app uses (municipalities that date completions):

| Start | Sites | Judged | In range | In range (units) | Within 1 year | Median error (years) | No year | Open |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows.map(r => line(`Jan 1, ${r.y}`, r.used)).join('\n')}

Every municipality pooled (before Oct 22, 2026), for comparison:

| Start | Sites | Judged | In range | In range (units) | Within 1 year | Median error (years) | No year | Open |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows.map(r => line(`Jan 1, ${r.y}`, r.pooled)).join('\n')}

Median error is the likely year less the actual (negative: it finished later than predicted).

## Reading it

- Over the four start dates, ${pct(sum('inRange'), sum('judged'))} of the ${n(sum('judged'))} judged sites finished within their range and
  ${pct(sum('within1'), sum('judged'))} within a year of the likely year.
- **Not a clear win on accuracy.** The pooled curves score higher in some years (by sites from 2020 to
  2022, by units in 2021 and 2022), but they are judged on far fewer sites: they give no year to the
  slower ones, which the curves the app uses do time. Compare the "Judged" and "No year" columns before
  the percentages. The large sites (by units) did worse in 2021 and 2022 under the curves the app uses.
- The pooled curves leave far more sites with no year at all, because Brampton's and Caledon's sites still
  waiting count while their finished ones (no date) drop out. That makes the curves too slow, which is why
  the app now uses the municipalities that date completions.
- By period's method note, in the Forecast's full table, works the same backtest out in the browser
  for the start date five years back, on the developments the app loads (dormant ones and site
  activity held aside), so its figures can differ from these by a few points.
- Brampton and Caledon rows are timed with these curves and marked in the ledger. A way to check them:
  date their completions from the yearly aerial photos (follow-up).
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log(`backtest → ${path.relative(ROOT, out)}`);
for (const r of rows) console.log(`${r.y}: used ${r.used.judged} judged, ${pct(r.used.inRange, r.used.judged)} in range; pooled ${r.pooled.judged} judged, ${pct(r.pooled.inRange, r.pooled.judged)} in range`);
