#!/usr/bin/env node
'use strict';
/*
 * Check the counts in data/unit-lookups.json against the pages they cite (Actions only; the
 * sandbox cannot reach the sites). For each entry with a link and units > 0: fetch the page (a
 * PDF through pdftotext), then report whether the file number and the recorded count appear on
 * it, with the text around each place the count appears. Log only: nothing is written or changed.
 * Usage: node scripts/probe-unit-lookups.js
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const L = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'unit-lookups.json'), 'utf8'));
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

async function pageText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(45000) });
  if (!res.ok) return { status: res.status, text: '' };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString() === '%PDF-') {
    const f = path.join(os.tmpdir(), `lk-${Date.now()}.pdf`); fs.writeFileSync(f, buf);
    try { return { status: res.status, pdf: true, text: execFileSync('pdftotext', ['-layout', f, '-'], { maxBuffer: 64 << 20 }).toString() }; }
    finally { fs.unlinkSync(f); }
  }
  const html = buf.toString('utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–');
  return { status: res.status, text };
}
const squash = s => s.replace(/\s+/g, ' ');
// The file number as written ("OZS-2022-0046", "SP 13-2", "21T-17008C"), with any separator.
function fileRe(key) {
  const num = key.split('|')[1].replace(/^(RZ|POPA|SPA|OPA)\s+/, '');
  return new RegExp(num.split(/[\s\-./]+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-./]*'), 'i');
}
// The count as written: 1946, 1,946 or 1 946; not inside a longer number.
const countRe = n => new RegExp(`(?<![\\d,.])${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '[,\\s]?')}(?![\\d,]|\\.\\d)`, 'g');

(async () => {
  const rows = Object.entries(L.files).filter(([, e]) => e.url && e.units > 0).sort((a, b) => b[1].units - a[1].units);
  const tally = { both: 0, countOnly: 0, fileOnly: 0, neither: 0, unreachable: 0 };
  const units = { both: 0, countOnly: 0, fileOnly: 0, neither: 0, unreachable: 0 };
  for (const [key, e] of rows) {
    let r;
    try { r = await pageText(e.url); } catch (err) { r = { status: err.name === 'TimeoutError' ? 'timeout' : err.message, text: '' }; }
    const t = squash(r.text || '');
    let verdict;
    if (!t) verdict = 'unreachable';
    else {
      const hasFile = fileRe(key).test(t), hits = [...t.matchAll(countRe(e.units))];
      verdict = hasFile && hits.length ? 'both' : hits.length ? 'countOnly' : hasFile ? 'fileOnly' : 'neither';
      r.hits = hits.slice(0, 3).map(m => t.slice(Math.max(0, m.index - 90), m.index + 70).trim());
    }
    tally[verdict]++; units[verdict] += e.units;
    const label = { both: 'FILE + COUNT on the page', countOnly: 'count on the page, file number not', fileOnly: 'file number on the page, count NOT', neither: 'neither file number nor count', unreachable: `UNREACHABLE (${r.status})` }[verdict];
    console.log(`\n${key}  ${e.units} units  [${e.confidence}]  ${label}${r.pdf ? ' (pdf)' : ''}\n  ${e.url}`);
    for (const h of r.hits || []) console.log(`  …${h}…`);
  }
  console.log(`\nEntries: ${rows.length}`);
  for (const k of Object.keys(tally)) console.log(`  ${k.padEnd(12)} ${String(tally[k]).padStart(3)} entries, ${units[k]} units`);
})();
