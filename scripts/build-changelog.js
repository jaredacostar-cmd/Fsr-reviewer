#!/usr/bin/env node
/*
 * Build data/changelog.json: one release per pull request merged into main, newest first, from
 * the git history (first-parent, so each merge is one entry). Version 1.<pull request number>;
 * the title is the pull request's title and the notes are its "- " bullets (or its commit list).
 * Weekly data snapshots are kept as data updates. Run at deploy (site.yml, full history) so the
 * log always includes the release being deployed.
 * Usage: node scripts/build-changelog.js [--out data/changelog.json]
 */
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');

const out = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'data/changelog.json'; })();
const SEP = '\u001e', END = '\u001d';
const raw = execFileSync('git', ['log', '--first-parent', `--format=%H${SEP}%h${SEP}%aI${SEP}%B${END}`, 'HEAD'], { encoding: 'utf8', maxBuffer: 64e6 });
const REPO = 'https://github.com/jaredacostar-cmd/Fsr-reviewer';
const TRAILER = /^(Co-Authored-By|Co-authored-by|Claude-Session|Signed-off-by):/i;

// Bullets from a message body: "- " items (wrapped lines joined), else "* " commit subjects.
function notes(body, title) {
  const lines = body.split('\n').filter(l => !TRAILER.test(l.trim()) && !/^-{3,}$/.test(l.trim()));
  const pick = mark => {
    const items = [];
    for (const l of lines) {
      const t = l.replace(/\s+$/, '');
      if (t.startsWith(mark)) items.push(t.slice(mark.length).trim());
      else if (items.length && /^\s{2,}\S/.test(t)) items[items.length - 1] += ' ' + t.trim();
      else if (items.length && t.trim() === '') items.push(null);
    }
    return items.filter(Boolean);
  };
  let b = pick('- ');
  if (!b.length) b = pick('* ').filter(x => x.replace(/\s*\(#\d+\)$/, '') !== title && !/^(Merge|Probe:|Revert)/.test(x));
  return [...new Set(b)].slice(0, 12);
}
function kind(title) {
  if (/^(fix|fixes|fixed|repair|restore|correct)\b/i.test(title)) return 'fix';
  if (/^(probe|data|weekly data|refresh)/i.test(title)) return 'data';
  return 'feature';
}

const releases = [], data = [];
for (const rec of raw.split(END)) {
  const [hash, short, date, msg] = rec.replace(/^\n/, '').split(SEP);
  if (!hash || !msg) continue;
  const lines = msg.trim().split('\n'), subject = lines[0].trim();
  if (/^Weekly data snapshot/i.test(subject)) { data.push({ date: date.slice(0, 10), sha: short }); continue; }
  let pr = null, title = subject, body = lines.slice(1).join('\n');
  let m = /^Merge pull request #(\d+) from \S+/.exec(subject);
  if (m) { pr = +m[1]; const t = body.trim().split('\n')[0]; title = t || subject; body = body.trim().split('\n').slice(1).join('\n'); }
  else if ((m = /\s*\(#(\d+)\)$/.exec(subject))) { pr = +m[1]; title = subject.slice(0, m.index); }
  if (!pr) continue;
  title = title.replace(/^Merge\s+/, '').replace(/^\w/, c => c.toUpperCase());   // housekeeping commits (initial commit, workflow setup)
  releases.push({ version: `1.${pr}`, pr, date: date.slice(0, 10), time: date, sha: short, title, kind: kind(title), notes: notes(body, title), url: `${REPO}/pull/${pr}` });
}
releases.sort((a, b) => b.pr - a.pr);
const doc = { version: 1, generatedAt: new Date().toISOString(), repo: REPO, latest: releases[0] ? releases[0].version : null, releases, dataUpdates: data };
fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
console.log(`${out}: ${releases.length} releases (latest ${doc.latest}), ${data.length} data updates`);
