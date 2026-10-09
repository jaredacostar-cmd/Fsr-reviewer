#!/usr/bin/env node
/** Probe 2: eSCRIBE page variants (agenda / minutes) for one past planning meeting per municipality. */
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2] || 'council2');
fs.mkdirSync(out, { recursive: true });
const UA = { 'user-agent': 'Mozilla/5.0 (peel-dev-tracker council probe)' };
const get = async (url, opts = {}) => { try { const r = await fetch(url, { headers: UA, redirect: 'follow', ...opts }); return { status: r.status, text: await r.text(), url: r.url }; } catch (e) { return { status: 0, text: '', error: e.message }; } };
(async () => {
  const rep = {};
  for (const [muni, host, re] of [['Mississauga', 'pub-mississauga.escribemeetings.com', /Planning and Development/], ['Brampton', 'pub-brampton.escribemeetings.com', /Planning and Development/], ['Caledon', 'pub-caledon.escribemeetings.com', /Planning and Development Committee$/]]) {
    const cal = await get(`https://${host}/MeetingsCalendarView.aspx/GetCalendarMeetings`, { method: 'POST', headers: { ...UA, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ calendarStartDate: '2024-01-01', calendarEndDate: '2026-10-01' }) });
    const ms = (JSON.parse(cal.text).d || []).filter(m => re.test(m.MeetingName) && m.MeetingPassed).sort((a, b) => new Date(b.StartDate) - new Date(a.StartDate));
    const m = ms[2] || ms[0];
    rep[muni] = { meeting: m, variants: {} };
    for (const v of ['Agenda', 'PostAgenda', 'PostMinutes', 'Minutes', 'Merged']) {
      const r = await get(`https://${host}/Meeting.aspx?Id=${m.ID}&Agenda=${v}&lang=English`);
      fs.writeFileSync(path.join(out, `${muni}-${v}.html`), r.text);
      rep[muni].variants[v] = { status: r.status, bytes: r.text.length, items: (r.text.match(/AgendaItemTitle/g) || []).length, files: (r.text.match(/OZS-\d{4}-\d{4}|OZ\/OPA \d\d-\d+|OZ \d\d-\d+|POPA \d{4}-\d{4}|RZ \d{4}-\d{4}|21T-\d+/g) || []).length, carried: (r.text.match(/Carried|CARRIED/g) || []).length };
    }
    if (m.MeetingDocumentLink) { const r = await get(`https://${host}/${m.MeetingDocumentLink.replace(/^\//, '')}`); rep[muni].docLink = { url: m.MeetingDocumentLink, status: r.status, bytes: r.text.length }; }
    rep[muni].meetingCount = ms.length;
  }
  fs.writeFileSync(path.join(out, 'probe2.json'), JSON.stringify(rep, null, 1));
  console.log(JSON.stringify(rep, null, 1));
})();
