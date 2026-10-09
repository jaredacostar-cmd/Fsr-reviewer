#!/usr/bin/env node
/**
 * Council and committee items that name development application files (data/council.json).
 *
 * For Mississauga, Brampton and Caledon, reads the eSCRIBE meeting calendar (planning committees,
 * council, general committee) from 2019, fetches each meeting's agenda — or its minutes once the
 * meeting has passed — and keeps the agenda items that name an application file number: the item
 * title, the reports and correspondence attached (links), the minutes text (discussion, motion,
 * vote) and the outcome. Meetings older than 120 days are kept from the previous file instead of
 * being fetched again.
 *
 *   node scripts/build-council.js [--out data] [--since 2019-01-01]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./council-parse.js');

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = path.resolve(arg('--out') || path.join(__dirname, '..', 'data'));
const SINCE = arg('--since') || '2019-01-01';
const UA = { 'user-agent': 'Mozilla/5.0 (peel-dev-tracker council index; weekly)' };
const PORTALS = [
  { muni: 'Mississauga', host: 'pub-mississauga.escribemeetings.com', meetings: /^(Planning and Development Committee|Council|General Committee)$/i },
  { muni: 'Brampton', host: 'pub-brampton.escribemeetings.com', meetings: /^(Planning and Development Committee|City Council|City Council - Special Meeting|Committee of Council)$/i },
  { muni: 'Caledon', host: 'pub-caledon.escribemeetings.com', meetings: /^(Planning and Development Committee.*|Council Meeting|Special Council Meeting|General Committee Meeting)$/i },
];
const REFETCH_DAYS = 120;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, redirect: 'follow', ...opts }); if (r.ok) return await r.text(); if (r.status === 404) return null; } catch (e) { /* retry */ }
    await sleep(1000 * (i + 1));
  }
  return null;
}
const trim = (s, n) => (s.length <= n ? s : `${s.slice(0, Math.round(n * 0.7))} … ${s.slice(-Math.round(n * 0.3))}`);

(async () => {
  let prev = { meetings: {} };
  try { prev = JSON.parse(fs.readFileSync(path.join(OUT, 'council.json'), 'utf8')); } catch (e) { /* first run */ }
  const out = { version: 1, generatedAt: new Date().toISOString(), since: SINCE, portals: PORTALS.map(p => ({ muni: p.muni, url: `https://${p.host}/` })), meetings: {}, files: {} };
  const now = Date.now(), end = new Date(now + 60 * 864e5);
  for (const portal of PORTALS) {
    const list = [];
    for (let y = Number(SINCE.slice(0, 4)); y <= end.getFullYear(); y++) {
      const t = await get(`https://${portal.host}/MeetingsCalendarView.aspx/GetCalendarMeetings`, { method: 'POST', headers: { ...UA, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ calendarStartDate: `${y}-01-01`, calendarEndDate: `${y}-12-31` }) });
      try { list.push(...(JSON.parse(t).d || [])); } catch (e) { console.log(`  ${portal.muni} ${y}: calendar unavailable`); }
    }
    const meetings = list.filter(m => portal.meetings.test(String(m.MeetingName).trim()) && m.HasAgenda !== false && new Date(m.StartDate) >= new Date(SINCE));
    console.log(`${portal.muni}: ${meetings.length} meetings`);
    let fetched = 0, kept = 0;
    for (const m of meetings) {
      const id = `${portal.muni}:${m.ID}`, date = new Date(m.StartDate);
      const old = prev.meetings && prev.meetings[id];
      if (old && now - date > REFETCH_DAYS * 864e5 && old.passed) { out.meetings[id] = old; kept++; continue; }
      const passed = !!m.MeetingPassed;
      const url = `https://${portal.host}/Meeting.aspx?Id=${m.ID}&Agenda=${passed ? 'PostMinutes' : 'Agenda'}&lang=English`;
      const html = await get(url);
      fetched++;
      if (!html) continue;
      const items = C.parseItems(html).map(it => ({ ...it, files: C.itemFiles(it) })).filter(it => it.files.length)
        .map(it => ({ n: it.counter, title: it.title, docs: it.docs.slice(0, 8).map(d => [d.id, d.name]), text: trim(it.body, 1400), outcome: it.outcome, files: it.files }));
      out.meetings[id] = { muni: portal.muni, name: String(m.MeetingName).trim(), date: m.StartDate.slice(0, 10).replace(/\//g, '-'), passed, url: `https://${portal.host}/Meeting.aspx?Id=${m.ID}&Agenda=${passed ? 'PostMinutes' : 'Agenda'}&lang=English`, host: portal.host, items };
      await sleep(250);
    }
    console.log(`  fetched ${fetched}, kept ${kept} from last week`);
  }
  // Index: file key → [meeting id, item index].
  for (const [id, m] of Object.entries(out.meetings)) m.items.forEach((it, i) => {
    for (const f of it.files) for (const k of C.fileKeys(f, m.muni)) {
      const key = `${m.muni}|${k}`; (out.files[key] = out.files[key] || []).push([id, i]);
    }
  });
  for (const k of Object.keys(out.files)) out.files[k] = [...new Map(out.files[k].map(x => [x.join('#'), x])).values()];
  fs.writeFileSync(path.join(OUT, 'council.json'), JSON.stringify(out));
  const nItems = Object.values(out.meetings).reduce((t, m) => t + m.items.length, 0);
  console.log(`data/council.json: ${Object.keys(out.meetings).length} meetings, ${nItems} items, ${Object.keys(out.files).length} file keys, ${(fs.statSync(path.join(OUT, 'council.json')).size / 1e6).toFixed(1)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
