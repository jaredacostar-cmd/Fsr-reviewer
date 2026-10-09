#!/usr/bin/env node
/**
 * Probe: can development applications be linked to council / committee meetings and decisions?
 * Tries each municipality's eSCRIBE meeting portal (calendar, agenda items, file numbers),
 * the application layers' fields (any document / web links), and the OLT case status site.
 * Writes --out/council-probe.json and sample agenda pages.
 */
const fs = require('fs');
const path = require('path');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const out = path.resolve(arg('--out') || 'council-probe');
fs.mkdirSync(out, { recursive: true });
const UA = { 'user-agent': 'Mozilla/5.0 (peel-dev-tracker council probe)' };
const FILE_RE = /\b(OZ\s*[\/-]?\s*(?:OPA\s*)?\d{2}[\/-]\d{1,3}(?:\s*W\d+)?|OZS-\d{4}-\d{4}|OZ-\d{4}-\d{4}|21T-?[A-Z]?\s*-?\d{2}[\s-]?\d{2,4}[A-Z]?|SPA?\s*\d{2}[\/-]\d{1,4}(?:\s*W\d+)?|SPA-\d{4}-\d{4}|RZ\s*\d{4}-\d{4}|POPA\s*\d{4}-\d{4}|CDM-\d{4}-\d{4}|DPS-\d{4}-\d{4})\b/gi;
const report = { at: new Date().toISOString(), escribe: {}, layers: {}, other: {} };
const get = async (url, opts = {}) => { try { const r = await fetch(url, { headers: UA, redirect: 'follow', ...opts }); const t = await r.text(); return { status: r.status, text: t, url: r.url }; } catch (e) { return { status: 0, text: '', error: e.message }; } };

(async () => {
  for (const [muni, host] of [['Mississauga', 'pub-mississauga.escribemeetings.com'], ['Brampton', 'pub-brampton.escribemeetings.com'], ['Caledon', 'pub-caledon.escribemeetings.com'], ['Peel', 'pub-peelregion.escribemeetings.com']]) {
    const R = report.escribe[muni] = { host };
    const home = await get(`https://${host}/`); R.home = home.status;
    const cal = await get(`https://${host}/MeetingsCalendarView.aspx/GetCalendarMeetings`, { method: 'POST', headers: { ...UA, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ calendarStartDate: '2025-01-01', calendarEndDate: '2026-10-31' }) });
    R.calendar = cal.status;
    let meetings = [];
    try { meetings = JSON.parse(cal.text).d || []; } catch (e) { R.calendarSample = cal.text.slice(0, 300); }
    R.meetingCount = meetings.length;
    const names = {}; for (const m of meetings) names[m.MeetingName] = (names[m.MeetingName] || 0) + 1;
    R.meetingTypes = names;
    R.meetingKeys = meetings[0] ? Object.keys(meetings[0]) : [];
    const plan = meetings.filter(m => /planning|development|council/i.test(m.MeetingName) && new Date(m.StartDate) < new Date()).sort((a, b) => new Date(b.StartDate) - new Date(a.StartDate));
    R.samples = [];
    for (const m of plan.slice(0, 3)) {
      const u = `https://${host}/Meeting.aspx?Id=${m.ID}&Agenda=Agenda&lang=English`;
      const pg = await get(u);
      fs.writeFileSync(path.join(out, `${muni}-${m.ID}.html`), pg.text);
      const files = [...new Set((pg.text.match(FILE_RE) || []).map(s => s.replace(/\s+/g, ' ').trim()))];
      const items = [...pg.text.matchAll(/class="AgendaItemTitle[^"]*"[^>]*>([\s\S]*?)<\//g)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
      const minutes = await get(`https://${host}/Meeting.aspx?Id=${m.ID}&Agenda=PostMinutes&lang=English`);
      R.samples.push({ name: m.MeetingName, date: m.StartDate, url: u, status: pg.status, bytes: pg.text.length, fileNumbers: files.slice(0, 30), items: items.slice(0, 25), docLinks: (pg.text.match(/FileStream\.ashx\?DocumentId=\d+/g) || []).length, minutes: minutes.status, minutesBytes: minutes.text.length, minutesResolutions: (minutes.text.match(/(Carried|Lost|Deferred|Referred|Received)/gi) || []).length });
    }
    // Full-text search endpoints (try a couple of shapes).
    for (const q of ['OZS-2023', 'OZ 22', 'RZ 2022']) {
      const s = await get(`https://${host}/Search.aspx?Keywords=${encodeURIComponent(q)}`);
      (R.search = R.search || []).push({ q, status: s.status, bytes: s.text.length, hits: (s.text.match(FILE_RE) || []).length });
    }
  }
  // Fields on the application layers (looking for document / web page links).
  for (const [id, url] of [['mis-devapps', 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/DevApps_September2026_WFL1/FeatureServer/0'], ['bra-opa-zba-sub', 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/9'], ['bra-siteplan', 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/11'], ['cal-devapps', 'https://services3.arcgis.com/AbUjpCl3KckkXVBh/arcgis/rest/services/Dev_Update_Online_Dynamic/FeatureServer/0']]) {
    const r = await get(`${url}?f=json`);
    try { const j = JSON.parse(r.text); report.layers[id] = (j.fields || []).map(f => f.name); } catch (e) { report.layers[id] = { status: r.status }; }
    const q = await get(`${url}/query?where=1%3D1&outFields=*&resultRecordCount=2&f=json`);
    try { report.layers[id + ':sample'] = (JSON.parse(q.text).features || []).map(f => f.attributes); } catch (e) { /* skip */ }
  }
  for (const [k, u] of [['olt-estatus', 'https://olt.gov.on.ca/e-status/'], ['mis-devapps-page', 'https://www.mississauga.ca/services-and-programs/planning-and-development/development-applications/development-applications-in-process/'], ['bra-devapps-page', 'https://www.brampton.ca/EN/Business/planning-development/Development-Applications/Pages/Welcome.aspx'], ['cal-devapps-page', 'https://www.caledon.ca/en/town-services/development-applications.aspx']]) {
    const r = await get(u);
    fs.writeFileSync(path.join(out, `${k}.html`), r.text);
    report.other[k] = { status: r.status, bytes: r.text.length, finalUrl: r.url, fileNumbers: [...new Set(r.text.match(FILE_RE) || [])].slice(0, 15), links: (r.text.match(/href="[^"]+"/g) || []).length };
  }
  fs.writeFileSync(path.join(out, 'council-probe.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, (k, v) => (k === 'items' || k.endsWith(':sample')) ? undefined : v, 1).slice(0, 20000));
})();
