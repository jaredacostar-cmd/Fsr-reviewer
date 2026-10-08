#!/usr/bin/env node
/*
 * Duplicate audit of data/snapshot.json (the same build the app does).
 *   node scripts/audit-snapshot.js [data/snapshot.json]
 * Prints a Markdown report (appended to the GitHub Actions job summary when run in CI)
 * and exits 1 if an integrity check fails.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../js/phases.js');
const { audit, toMarkdown } = require('../js/audit.js');
const { decodeRecord } = require('./build-snapshot.js');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'snapshot.json'));
const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
const names = new Map(snap.sources.map(s => [s.id, s.name]));
const raw = snap.records.map(o => decodeRecord(o, names.get(String(o.sourceId).split('/')[0])));
const deduped = P.dedupeRecords(raw);
const projects = P.buildProjects(deduped);
const a = audit(raw, deduped, projects);
const md = toMarkdown(a, `Duplicate audit · snapshot ${String(snap.generatedAt).slice(0, 10)}`) +
  '\n\n### Possible duplicates to review (first 25)\n\n| Distance | Project A (units, phase) | Project B (units, phase) |\n|---:|---|---|\n' +
  a.possible.slice(0, 25).map(x => `| ${Math.round(x.metres)} m | ${x.projects.map(p => `${p.title} (${p.units}, ${p.phase})`).join(' | ')} |`).join('\n') + '\n';
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
if (a.checks.some(c => c.value !== 0)) process.exit(1);
