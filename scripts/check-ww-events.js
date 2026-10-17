#!/usr/bin/env node
/*
 * Check data/ww-events.json against a Wastewater Collection System annual report (text from
 * `pdftotext -layout`). Table 7's layout breaks rows across lines and merges cells, so the events
 * are transcribed by hand; this check makes the transcription verifiable each year:
 *   - every Spills Action Centre reference in Table 7 is in the year's events, the same number of
 *     times, and no event has a reference the table lacks;
 *   - the number of events equals the report's stated total ("a total of 12 spills", "There were 18
 *     spills");
 *   - every station in Appendix A Table 9 (South Peel) is in the roster.
 * Usage: node scripts/check-ww-events.js <report.txt> <year> [data/ww-events.json]
 * Exits 1 with the differences when anything disagrees.
 */
'use strict';
const fs = require('fs');

const [txtP, year, jsonP = 'data/ww-events.json'] = process.argv.slice(2);
if (!year) { console.error('usage: check-ww-events.js <report.txt> <year> [ww-events.json]'); process.exit(2); }
const txt = fs.readFileSync(txtP, 'utf8');
const D = JSON.parse(fs.readFileSync(jsonP, 'utf8'));
const ev = (D.years || {})[year];
const bad = [];
if (!ev) { console.error(`no events for ${year} in ${jsonP}`); process.exit(1); }

// ---- Table 7 ----
const t0 = txt.search(/Table 7\.\s+Summary of spills/i);
const t1 = txt.search(/Overflow and spill events are reported/i);
if (t0 < 0 || t1 < t0) bad.push('Table 7 not found (the report layout changed)');
else {
  const refs = (txt.slice(t0, t1).match(/\b1-[A-Z0-9]{6}\b/g) || []);
  const count = a => a.reduce((m, r) => m.set(r, (m.get(r) || 0) + 1), new Map());
  const inTable = count(refs), inJson = count(ev.map(e => e.sacRef));
  for (const [r, n] of inTable) if ((inJson.get(r) || 0) !== n) bad.push(`${r}: ${n} in Table 7, ${inJson.get(r) || 0} in the data`);
  for (const [r, n] of inJson) if (!inTable.has(r)) bad.push(`${r}: in the data (${n}), not in Table 7`);
}

// ---- Stated total ----
const m = txt.match(/total of (\d+) spills|There were (\d+)\s+spills/i);
const stated = m ? +(m[1] || m[2]) : null;
if (stated == null) bad.push('stated total not found');
else if (stated !== ev.length) bad.push(`report states ${stated} spills, the data has ${ev.length}`);

// ---- Appendix A roster ----
const a0 = txt.search(/Table 9\.\s+List of pumping stations/i), a1 = txt.search(/Table 10\./i);
if (a0 >= 0 && a1 > a0) {
  const norm = s => s.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  const roster = new Set((D.stations.southPeel || []).map(norm));
  const names = [...txt.slice(a0, a1).matchAll(/^\s*\d+\s+(.+?)\s+SPS\s+(City|Town) of/gm)].map(x => x[1]);
  for (const n of names) if (!roster.has(norm(n))) bad.push(`Table 9 station not in the roster: ${n}`);
  if (names.length && names.length !== roster.size) bad.push(`Table 9 lists ${names.length} stations, the roster ${roster.size}`);
}

if (bad.length) { console.error(`ww-events ${year}: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`); process.exit(1); }
console.log(`ww-events ${year}: ${ev.length} events match Table 7 and the stated total${a0 >= 0 ? '; roster matches Table 9' : ''}`);
