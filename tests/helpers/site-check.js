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
      const message = String((e && e.message) || e).split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 300);
      t.diagnostic(`site check changed: ${message}`);
      if (process.env.SITE_CHECKS_REPORT) fs.appendFileSync(process.env.SITE_CHECKS_REPORT, `${JSON.stringify({ test: name, message })}\n`);
    }
  });
}

module.exports = { siteTest };
