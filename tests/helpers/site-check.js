'use strict';
// Tests pinned to one real site (its stage, its counts, its files) follow the municipal data, which
// moves every week. On a pull request they fail as usual. In the weekly data refresh and the deploy
// (SITE_CHECKS=warn) a failure is a finding, not a stop: it is written to SITE_CHECKS_REPORT (one
// JSON line per test) for the refresh to list for review, and the test passes. Totals that must add
// up, and the privacy checks, are ordinary tests: they stay strict everywhere.
const test = require('node:test');
const fs = require('fs');

function siteTest(name, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  if (process.env.SITE_CHECKS !== 'warn') return test(name, opts, fn);
  return test(name, opts, async t => {
    try { await fn(t); } catch (e) {
      // (the assertion's first line, then what changed: its diff lines when it printed a diff, e.g. "+ 8, - 7,"
      // for 8 files where 7 were expected; else its own next lines, e.g. "18 !== 17". The first three lines
      // alone stopped at "+ actual - expected [", and the diff lines alone dropped "18 !== 17")
      const lines = String((e && e.message) || e).split('\n').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean);
      const rest = lines.slice(1).filter(l => !/^\+ actual - expected$/.test(l)), diff = rest.filter(l => /^[+-] /.test(l));
      const message = [lines[0], ...(diff.length ? diff : rest).slice(0, 8)].join(' ').slice(0, 500);
      t.diagnostic(`site check changed: ${message}`);
      if (process.env.SITE_CHECKS_REPORT) fs.appendFileSync(process.env.SITE_CHECKS_REPORT, `${JSON.stringify({ test: name, message })}\n`);
    }
  });
}

module.exports = { siteTest };
