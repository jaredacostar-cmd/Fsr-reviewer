'use strict';
// Stage 5 — pilot support: the usage counter (local, anonymous, CSV), "Report a data issue" at the
// foot of every panel and page, and Help's "What moved where" note.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
const U = require('../js/usage.js');
const RI = require('../js/report-issue.js');

test('usage: counts per day and name; only the fixed names (no developments, searches or people)', () => {
  let d = null;
  d = U.bump(d, 'page', 'tight', '2026-10-16');
  d = U.bump(d, 'page', 'tight', '2026-10-16');
  d = U.bump(d, 'tab', 'svc', '2026-10-16');
  d = U.bump(d, 'sub', 'svc.capacity', '2026-10-17');
  d = U.bump(d, 'full', '', '2026-10-17');
  // Ignored: an unknown kind, free text (an address, a search), a bad date.
  d = U.bump(d, 'search', 'tight', '2026-10-17');
  d = U.bump(d, 'page', '0 Heritage Rd', '2026-10-17');
  d = U.bump(d, 'page', 'dev:abc:123', '2026-10-17');
  d = U.bump(d, 'page', 'tight', 'today');
  assert.equal(d.since, '2026-10-16');
  assert.deepEqual(plain(d.days), { '2026-10-16': { 'page:tight': 2, 'tab:svc': 1 }, '2026-10-17': { 'sub:svc.capacity': 1, full: 1 } });
  assert.deepEqual(plain(U.totals(d)), { 'page:tight': 2, 'tab:svc': 1, 'sub:svc.capacity': 1, full: 1 });
  assert.deepEqual(plain(U.KINDS), ['start', 'page', 'map', 'full', 'tab', 'sub', 'side', 'issue']);
});

test('usage: CSV with a label per name (quoted when it needs it); old days drop off', () => {
  let d = U.bump(null, 'page', 'tight', '2026-10-16');
  d = U.bump(d, 'tab', 'svc', '2026-10-16');
  const csv = U.toCSV(d, { 'page:tight': 'Servicing capacity (page)', 'tab:svc': 'Servicing, both systems' });
  assert.equal(csv, 'date,kind,id,label,count\n2026-10-16,page,tight,Servicing capacity (page),1\n2026-10-16,tab,svc,"Servicing, both systems",1\n');
  // At most MAX_DAYS days are kept: the oldest go first.
  let e = null;
  for (let i = 0; i < U.MAX_DAYS + 3; i++) { const t = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10); e = U.bump(e, 'page', 'home', t); }
  assert.equal(Object.keys(e.days).length, U.MAX_DAYS);
  assert.ok(!e.days['2025-01-01'] && !e.days['2025-01-03'] && e.days['2025-01-04']);
});

test('usage: a person’s clicks count (not the app moving itself); Settings shows it with Export CSV', () => {
  const s = src('js/usage.js');
  assert.match(s, /window\.addEventListener\('click', onClick, true\);/);
  for (const sel of ['[data-ws-page]', '[data-ws-home]', '[data-ws-go]', '[data-ws-full]', '.f-tab[data-tab]', 'a[data-report-panel]']) assert.ok(s.includes(`at('${sel}')`), sel);
  assert.match(s, /const SUB_ATTR = \{ gsub: 'growth', svcsub: 'svc', dcasub: 'dca', rsub: 'records' \};/);
  // Kept in this browser only: no fetch, no beacon.
  assert.doesNotMatch(s, /fetch\(|sendBeacon|XMLHttpRequest/);
  assert.match(s, /s\.set\('usage', bump\(load\(\), kind, id, today\(\)\)\)/);
  assert.match(s, /data-usage-csv>Export CSV</);
  assert.match(src('js/growth-ui.js'), /root\.PeelUsage && root\.PeelUsage\.settingsHTML \? root\.PeelUsage\.settingsHTML\(\)/);
  assert.match(src('index.html'), /<script src="js\/workspaces\.js\?v=__BUILD__"><\/script>\n {2}<script src="js\/usage\.js\?v=__BUILD__"><\/script>/);
});

test('Report a data issue: a pre-filled issue naming the panel and a link to the view (no search text)', () => {
  const url = RI.panelIssueUrl({ name: 'Can the system take it?', key: 'svc:capacity', where: 'Full map', link: 'https://x.test/app/#mu=Brampton&q=smith&w=p:tight' }, { appVersion: 'v1.230', snapshotDate: '2026-10-12' });
  const q = new URL(url).searchParams;
  assert.ok(url.startsWith(`${RI.REPO_URL}/issues/new?`));
  assert.equal(q.get('title'), 'Data issue: Can the system take it? (Full map)');
  const body = q.get('body');
  assert.match(body, /\*\*Panel:\*\* Can the system take it\? \(svc:capacity\)/);
  assert.match(body, /\*\*Link to this view:\*\* https:\/\/x\.test\/app\/#mu=Brampton&w=p%3Atight/);
  assert.doesNotMatch(body, /smith/);
  assert.match(body, /\*\*App version:\*\* v1\.230/);
  assert.match(body, /Please attach a screenshot/);
  assert.equal(RI.linkWithoutSearch('https://x.test/#q=a'), 'https://x.test/');
});

test('Report a data issue sits at the foot of every panel and every page, at the end of the actions', () => {
  const win = {}; const ctx = { window: win }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/report-issue.js'), ctx);
  vm.runInNewContext(src('js/panel.js'), ctx);
  const h = win.PeelPanel.html({ key: 'growth:pipeline', head: { name: 'How much is coming?' } });
  assert.match(h, /<span class="pnl-report-line small"><a class="pnl-report" href="https:\/\/github\.com\/[^"]+\/issues\/new" target="_blank" rel="noopener" data-report-panel="growth:pipeline" data-report-name="How much is coming\?" data-report-where="" data-info="report-issue">Report a data issue ↗<\/a><\/span><\/div>\s*<p class="pnl-note small">General screening results only\.[^<]*<\/p><\/footer>/);
  // The workspace pages (Home's layout) too.
  const mod = { exports: {} }; ctx.module = mod;
  vm.runInNewContext(src('js/ws-pages.js'), ctx);
  const p = mod.exports.pageHTML({ id: 'tight', name: 'Can the system take it?', answer: 'x' }, 'note');
  assert.match(p, /data-report-panel="page:tight" data-report-name="Can the system take it\?" data-report-where="Workspace page"/);
  // The address is filled on click (the view may have changed since the panel was drawn).
  assert.match(src('js/report-issue.js'), /document\.addEventListener\('click', fill, true\);/);
});

// Help › What moved where.
const tips = src('js/tips.js');
const MOVED = new Function(`${tips.match(/const MOVED = \[[\s\S]*?\n {2}\];/)[0]}; return MOVED;`)();

test('What moved where: every old tab and sub-view says where it is now', () => {
  const left = MOVED.flatMap(g => g.rows.map(r => r[0])).join(' | ');
  // The sub-views before Stage 2 (Wastewater, Water, Growth, Capital), by their old labels.
  for (const old of ['Plants & capacity', 'Blocks', 'Pumping stations', 'Allocations', 'Treatment & capacity', 'Pressure zones', 'Facilities', 'Hydraulic check (beta)', 'Census & 2051', 'By plan', 'DC timing', 'Construction', 'Funding screen', 'Funding levels', 'Files & history']) assert.ok(left.includes(old), old);
  for (const old of ['Existing', 'Built', 'Committed', 'Proposed', 'Anticipated']) assert.ok(MOVED.some(g => g.rows.some(r => r[0] === old)), old);
  // Where they went matches the old-link migration (js/analysis-tabs.js SUB_MAP).
  const now = old => MOVED.flatMap(g => g.rows).find(r => r[0].includes(old))[1];
  assert.match(now('Plants & capacity'), /Servicing › Capacity/);
  assert.match(now('Pressure zones'), /Servicing › Network/);
  assert.match(now('Water › Facilities'), /Servicing › Checks/);
  assert.match(now('Census & 2051'), /Growth › Areas/);
  assert.match(now('Capital › Construction'), /Capital › Projects/);
  const at = src('js/analysis-tabs.js');
  assert.match(at, /ww: \{ plants: 'capacity', catchments: 'network', alloc: 'alloc', pumpstations: 'network' \}/);
  assert.match(at, /water: \{ capacity: 'capacity', zones: 'network', facilities: 'checks', hydro: 'checks' \}/);
  assert.match(at, /dca: \{ timing: 'timing', build: 'projects'/);
  // In Help: its own card and a button at the top; old tab names gone from the guides.
  assert.match(tips, /<details class="help-card help-moved" id="help-moved"><summary><strong>What moved where<\/strong>/);
  assert.match(tips, /data-help-moved>What moved where<\/button>/);
  assert.doesNotMatch(tips, /Water and Wastewater tabs|Analysis → Wastewater|openAnalysis\('ww'|openAnalysis\('water'\)/);
});
