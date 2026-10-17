/*
 * Small checks the weekly data builds share, so a source outage or a short download never
 * replaces last week's good data (scripts/build-*.js; tests/build-guards.test.js).
 */
'use strict';

// True when there was a previous count and this one falls below `ratio` of it (or isn't a number).
function shrank(n, prev, ratio) {
  return Number(prev) > 0 && !(Number(n) >= prev * ratio);
}

// Council meetings (scripts/build-council.js): last week's meetings of `muni` dated in a calendar
// year that could not be read this week are copied into `meetings` (those not already there).
// Returns how many were carried over.
function carryMeetings(prevMeetings, meetings, { muni, failedYears, since = '' }) {
  let n = 0;
  for (const [id, m] of Object.entries(prevMeetings || {})) {
    if (!m || m.muni !== muni || meetings[id]) continue;
    const date = String(m.date || '');
    if (date < since || !failedYears.has(date.slice(0, 4))) continue;
    meetings[id] = m; n++;
  }
  return n;
}

// Items per municipality (data/fsr.json).
function countBy(items, key) {
  const out = {};
  for (const x of items || []) { const k = x && x[key]; if (k) out[k] = (out[k] || 0) + 1; }
  return out;
}

// The groups whose count fell below `ratio` of the previous build's: [{ key, n, prev }].
function shrunkGroups(counts, prevCounts, ratio) {
  return Object.entries(prevCounts || {}).filter(([k, p]) => shrank((counts || {})[k] || 0, p, ratio)).map(([key, prev]) => ({ key, n: (counts || {})[key] || 0, prev }));
}

// Constraint layers (scripts/build-constraints.js): the screening grid is rebuilt only when every
// dataset that feeds it was rebuilt in this run; otherwise the previous grid stays.
function gridComplete(datasets, rebuilt) {
  return datasets.filter(d => d.grid).every(d => rebuilt.has(d.id));
}

// Region address points (scripts/fetch-addresses.js): a download is short when the service gave no
// usable count or fewer than half its points came down.
function addressesShort(n, count) {
  return !(count > 0) || n < count * 0.5;
}

module.exports = { shrank, carryMeetings, countBy, shrunkGroups, gridComplete, addressesShort };
