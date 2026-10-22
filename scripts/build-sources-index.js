#!/usr/bin/env node
/*
 * Each data file's date, size and fingerprint (data/sources-index.json), for the receipts table
 * (js/sources.js). Run at deploy (.github/workflows/site.yml), so the dates and hashes always match
 * the files published with them; not committed (.gitignore).
 *
 *   node scripts/build-sources-index.js [--data data]
 *
 * The date comes from each file's dateField (data/sources.json); a folder entry ('constraints/')
 * reads it from a file inside it ('manifest.json:built') and its fingerprint covers every file in it.
 * The snapshot's layers (snapshot.json › sources) become its links, so the monthly Mississauga layer
 * is always the one named.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../js/sources.js');

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const dir = path.resolve(arg('--data') || path.join(__dirname, '..', 'data'));
const registry = JSON.parse(fs.readFileSync(path.join(dir, 'sources.json'), 'utf8'));

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? (e.name === '__pycache__' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)])).sort();
}
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

const files = {};
for (const [name, e] of Object.entries(registry.files)) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) continue;
  const out = {};
  if (name.endsWith('/')) {
    // A folder: one fingerprint over every file's path and hash.
    const all = walk(p), h = crypto.createHash('sha256');
    let bytes = 0;
    for (const f of all) { const b = fs.readFileSync(f); bytes += b.length; h.update(`${path.relative(p, f)}\0${sha(b)}\n`); }
    Object.assign(out, { sha256: h.digest('hex'), bytes, count: all.length });
    if (e.dateField && e.dateField.includes(':')) { const [f, k] = e.dateField.split(':'); out.asOf = S.dateOf(readJSON(path.join(p, f)), k); }
  } else {
    const b = fs.readFileSync(p);
    Object.assign(out, { sha256: sha(b), bytes: b.length });
    const j = name.endsWith('.json') && (e.dateField || e.linksFrom) ? readJSON(p) : null;
    if (e.dateField) out.asOf = S.dateOf(j, e.dateField);
    if (e.linksFrom && j && Array.isArray(j[e.linksFrom])) out.links = j[e.linksFrom].filter(s => s && s.url).map(s => ({ label: s.name || s.id, url: s.url }));
  }
  files[name] = out;
}
const out = { generatedAt: new Date().toISOString(), files };
fs.writeFileSync(path.join(dir, 'sources-index.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`sources-index.json: ${Object.keys(files).length} of ${Object.keys(registry.files).length} entries`);
