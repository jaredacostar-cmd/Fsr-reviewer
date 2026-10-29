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

test('usage: counts per day and name; only the fixed names (no developments, search text or people)', () => {
  let d = null;
  d = U.bump(d, 'page', 'tight', '2026-10-16');
  d = U.bump(d, 'page', 'tight', '2026-10-16');
  d = U.bump(d, 'tab', 'svc', '2026-10-16');
  d = U.bump(d, 'sub', 'svc.capacity', '2026-10-17');
  d = U.bump(d, 'full', '', '2026-10-17');
  // Ignored: an unknown kind, free text (an address, a search: a search counts only the kind of place it
  // found, navigation phase 7), a bad date.
  d = U.bump(d, 'search', 'tight', '2026-10-17');
  d = U.bump(d, 'query', 'tight', '2026-10-17');
  d = U.bump(d, 'page', '0 Heritage Rd', '2026-10-17');
  d = U.bump(d, 'page', 'dev:abc:123', '2026-10-17');
  d = U.bump(d, 'page', 'tight', 'today');
  assert.equal(d.since, '2026-10-16');
  assert.deepEqual(plain(d.days), { '2026-10-16': { 'page:tight': 2, 'tab:svc': 1 }, '2026-10-17': { 'sub:svc.capacity': 1, full: 1 } });
  assert.deepEqual(plain(U.totals(d)), { 'page:tight': 2, 'tab:svc': 1, 'sub:svc.capacity': 1, full: 1 });
  assert.deepEqual(plain(U.KINDS), ['start', 'page', 'map', 'full', 'tab', 'sub', 'side', 'issue', 'role', 'search']);
});

// Navigation phase 7 (NP-7 and P4-10 with change): the counts record the role picked and what kind of place a
// search found, so a pilot's counts can be read by role and show whether Find and the search took over from the
// sidebar entries that went. Fixed names only, as every other count.
const W7 = require('../js/workspaces.js');
// usage.js's browser part in a vm: the stored role, a click (window capture) and the start count (after load).
function usageBrowser(role) {
  const kept = { role }, wl = {}, timers = [];
  const store = { get: (k, v) => (kept[k] == null ? v : kept[k]), set: (k, v) => { kept[k] = v; } };
  const document = { readyState: 'complete', getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} };
  const window = { PeelUtil: { store, esc: String, fmtNum: String }, PeelWorkspaces: { mode: () => 'home', ROLES: W7.ROLES, WS: [] }, addEventListener: (t, f) => { wl[t] = f; } };
  vm.runInNewContext(src('js/usage.js'), { window, document, location: { hash: '' }, performance: { getEntriesByType: () => [] }, setTimeout: f => timers.push(f), Date });
  timers.splice(0).forEach(f => f());
  const counts = () => Object.assign({}, ...Object.values((kept.usage && kept.usage.days) || {}));
  const click = (el, sels) => wl.click({ target: { closest: sel => (sels.includes(sel) ? el : null) } });
  return { counts, click, U: window.PeelUsage };
}

test('usage: the role counts once per visit, a ROLES key or none (never free text); a shortcut into a view of Home counts the view (navigation phase 7)', () => {
  let d = U.bump(null, 'role', 'qa', '2026-10-28');
  d = U.bump(d, 'role', 'Jane Smith', '2026-10-28');
  d = U.bump(d, 'role', 'none', '2026-10-28');
  assert.deepEqual(plain(d.days), { '2026-10-28': { 'role:qa': 1, 'role:none': 1 } }, 'a name is not a key');
  // Once per load, with the start count: the stored role when it is one of the six, else none.
  assert.deepEqual(usageBrowser('qa').counts(), { 'start:home': 1, 'role:qa': 1 });
  assert.deepEqual(usageBrowser('').counts(), { 'start:home': 1, 'role:none': 1 });
  assert.deepEqual(usageBrowser('planner').counts(), { 'start:home': 1, 'role:none': 1 }, 'an older browser’s stray value is no role');
  for (const r of W7.ROLES) assert.deepEqual(usageBrowser(r.key).counts()[`role:${r.key}`], 1, r.key);
  const s = src('js/usage.js');
  assert.match(s, /count\('role', W && W\.ROLES && W\.ROLES\.some\(r => r\.key === rk\) \? rk : 'none'\);/);
  // A role shortcut or a Help row with data-ws-at counts the view it opens, as the strip's chips do, not Home.
  const b = usageBrowser('qa');
  b.click({ dataset: { wsPage: 'home', wsAt: 'records:checks' } }, ['[data-ws-at]', '[data-ws-page]']);
  b.click({ dataset: { wsPage: 'find' } }, ['[data-ws-page]']);
  assert.deepEqual(b.counts(), { 'start:home': 1, 'role:qa': 1, 'sub:records.checks': 1, 'page:find': 1 });
  assert.ok(s.indexOf("at('[data-ws-at]')") < s.indexOf("at('[data-ws-page]')"), 'before the page’s own count');
  // Labelled for Settings and the CSV; Settings' table lists what was opened (the role per visit is in the CSV).
  const L = b.U.labels();
  assert.equal(L['role:qa'], 'Role: QA/QC (data review)');
  assert.equal(L['role:none'], 'Role: none picked');
  assert.equal(L['page:find'], 'Find (page)');
  assert.equal(L['page:help'], 'Help (page)');
  assert.doesNotMatch(b.U.settingsHTML(), /Role:/);
  assert.match(b.U.settingsHTML(), /No developments, search text or names are counted: a search counts only what kind of place it found\./);
});

test('usage: a search counts only what kind of place it found, never its text (navigation phase 7, P4-10)', () => {
  let d = null;
  for (const k of Object.keys(U.SEARCH)) d = U.bump(d, 'search', k, '2026-10-28');
  d = U.bump(d, 'search', '0 heritage rd', '2026-10-28');
  d = U.bump(d, 'search', 'heritage', '2026-10-28');
  d = U.bump(d, 'search', 'constructor', '2026-10-28');
  assert.deepEqual(Object.keys(d.days['2026-10-28']).sort(), Object.keys(U.SEARCH).map(k => `search:${k}`).sort());
  assert.deepEqual(plain(Object.keys(U.SEARCH)), ['dev', 'file', 'plan', 'mtsa', 'svc', 'dc', 'dcfac', 'filter', 'place', 'address']);
  // Every place hit the search makes (js/search-filter.js placeMatches) is a kind.
  const sf = src('js/search-filter.js');
  for (const [, h] of sf.matchAll(/hit: '(\w+)'/g)) assert.ok(Object.prototype.hasOwnProperty.call(U.SEARCH, h), h);
  // One count per pick (goSug), by the kind: the filter item, a development (or its file number), a place's hit,
  // else an address; never x.label, x.p.title, x.g or the box's value. Before the box lets go and the routing
  // (page-search.test: blur < filter < route).
  const g = sf.slice(sf.indexOf('  function goSug(x) {'), sf.indexOf("$('#f-search').addEventListener('input'"));
  const line = "const Us = window.PeelUsage; if (Us && Us.count) Us.count('search', x.filter ? 'filter' : x.p ? (x.hit === 'file' ? 'file' : 'dev') : x.place ? (x.place.hit || 'place') : 'address');";
  assert.ok(g.includes(line));
  assert.ok(g.indexOf('if (!x || x.loading) return;') < g.indexOf(line) && g.indexOf(line) < g.indexOf("if (onPage) $('#f-search').blur();"));
  assert.equal((g.match(/Us\.count\(/g) || []).length, 1);
  assert.equal((sf.match(/PeelUsage/g) || []).length, 1, 'the search counts nowhere else');
  // The kinds by their own words in Settings and the CSV.
  const L = usageBrowser('').U.labels();
  assert.equal(L['search:plan'], 'Search: a plan');
  assert.equal(L['search:file'], 'Search: a file number');
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

test('usage: a retired sub-view\'s counts add up with where it moved (navigation phase 2)', () => {
  let d = null;
  d = U.bump(d, 'sub', 'svc.alloc', '2026-10-16'); d = U.bump(d, 'sub', 'svc.alloc', '2026-10-16');
  d = U.bump(d, 'sub', 'svc.capacity', '2026-10-16'); d = U.bump(d, 'sub', 'svc.checks', '2026-10-16');
  const alias = k => ({ 'sub:svc.alloc': 'sub:svc.capacity', 'sub:svc.checks': 'sub:records.checks' }[k] || k);
  assert.deepEqual(plain(U.totals(d, alias)), { 'sub:svc.capacity': 3, 'sub:records.checks': 1 });
  assert.equal(U.toCSV(d, {}, alias), 'date,kind,id,label,count\n2026-10-16,sub,records.checks,,1\n2026-10-16,sub,svc.capacity,,3\n');
  // Without an alias, the counts as kept; the kept counts are never rewritten.
  assert.deepEqual(plain(U.totals(d)), { 'sub:svc.alloc': 2, 'sub:svc.capacity': 1, 'sub:svc.checks': 1 });
  assert.deepEqual(plain(d.days['2026-10-16']), { 'sub:svc.alloc': 2, 'sub:svc.capacity': 1, 'sub:svc.checks': 1 });
  // In the browser the alias is the tabs' own table (js/analysis-tabs.js migrateSub), for Settings and the CSV.
  const s = src('js/usage.js');
  assert.match(s, /const aliasKey = k => \{ const m = \/\^sub:\(\\w\+\)\\\.\(\\w\+\)\$\/\.exec\(k\), AT = root\.PeelAnalysisTabs, r = m && AT && AT\.migrateSub \? AT\.migrateSub\(m\[1\], m\[2\]\) : null; return r \? `sub:\$\{r\.tab\}\.\$\{r\.sub\}` : k; \};/);
  assert.ok(s.includes('t = totals(d, aliasKey)') && s.includes('toCSV(load(), labels(), aliasKey)'), 'Settings › Usage and its CSV');
  const el = () => null, document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store: { get: (k, v) => v, set: () => {} } }, document }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx; vm.runInNewContext(src('js/analysis-tabs.js'), ctx);
  const AT = ctx.module.exports;
  assert.deepEqual(plain(AT.migrateSub('svc', 'alloc')), { tab: 'svc', sub: 'capacity' });
  assert.deepEqual(plain(AT.migrateSub('svc', 'checks')), { tab: 'records', sub: 'checks' });
  // Navigation phase 3: the Ledger's counts are the Forecast's, by the browser's own rule (aliasKey above).
  const alias3 = k => { const m = /^sub:(\w+)\.(\w+)$/.exec(k), r = m && AT.migrateSub(m[1], m[2]); return r ? `sub:${r.tab}.${r.sub}` : k; };
  let g = U.bump(null, 'sub', 'growth.ledger', '2026-10-26'); g = U.bump(g, 'sub', 'growth.ledger', '2026-10-26'); g = U.bump(g, 'sub', 'growth.timing', '2026-10-27');
  const tg = plain(U.totals(g, alias3));
  assert.deepEqual(tg, { 'sub:growth.timing': 3 }, 'no sub:growth.ledger key');
  assert.equal(U.toCSV(g, {}, alias3), 'date,kind,id,label,count\n2026-10-26,sub,growth.timing,,2\n2026-10-27,sub,growth.timing,,1\n');
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
  // The map centre to 3 decimals (≈100 m), the zoom as it was.
  assert.equal(RI.linkWithoutSearch('https://x.test/#m=43.66812%2C-79.75764%2C17&q=12+main'), 'https://x.test/#m=43.668%2C-79.758%2C17');
});

test('Report a data issue sits at the foot of every panel and every page, at the end of the screening note (design bundle 4)', () => {
  const win = {}; const ctx = { window: win }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/report-issue.js'), ctx);
  vm.runInNewContext(src('js/panel.js'), ctx);
  const h = win.PeelPanel.html({ key: 'growth:pipeline', head: { name: 'How much is coming?' } });
  assert.match(h, /<\/div>\s*<p class="pnl-note small">General screening results only\.[^<]*<span class="pnl-report-line small"><a class="pnl-report" href="https:\/\/github\.com\/[^"]+\/issues\/new" target="_blank" rel="noopener" data-report-panel="growth:pipeline" data-report-name="How much is coming\?" data-report-where="" data-info="report-issue">Report a data issue ↗<\/a><\/span><\/p><\/footer>/);
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
  assert.match(now('Water › Facilities'), /Servicing › Network/);
  assert.match(now('Census & 2051'), /Growth › Areas/);
  assert.match(now('Capital › Construction'), /Capital › Projects/);
  // Navigation phase 3: the Ledger is the Forecast's By period; What's coming opens it there.
  assert.match(now('Growth › Ledger'), /Growth › Forecast/);
  assert.match(now('Home › What’s coming'), /Growth › Forecast/);
  const at = src('js/analysis-tabs.js');
  assert.match(at, /ww: \{ plants: 'capacity', catchments: 'network', alloc: 'capacity', pumpstations: 'network' \}/);
  assert.match(at, /water: \{ capacity: 'capacity', zones: 'network', facilities: 'network', hydro: 'network' \}/);
  assert.match(at, /dca: \{ timing: 'timing', build: 'projects'/);
  assert.match(at, /growth: \{ pipeline: 'pipeline', census2051: 'areas', byplan: 'areas', timing: 'timing', areas: 'areas', ledger: 'timing' \}/);
  // In Help: its own card and a button at the top; old tab names gone from the guides.
  assert.match(tips, /<details class="help-card help-moved" id="help-moved"><summary><strong>What moved where<\/strong>/);
  assert.match(tips, /data-help-moved>What moved where<\/button>/);
  assert.doesNotMatch(tips, /Water and Wastewater tabs|Analysis → Wastewater|openAnalysis\('ww'|openAnalysis\('water'\)/);
});
