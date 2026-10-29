'use strict';
// Design bundle 6 — organization: a development's files as a tree (Records › Files, the rows of
// Growth in an area, the estimate rows), one stage on each row, and the rest of the reorganization.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const T = require('../js/file-tree.js');
const TREE = require('../data/tree-counts.json');
const dev = k => TREE.devs.find(d => d.k === k);

test('file tree: one root, the files on its land under it, earlier files on the same land folded, links to check', () => {
  const d = dev('Brampton|295 QUEEN ST E');
  const s = T.summary(d);
  // (SPA-2021-0162 names SPA-2019-0029, "previously envisioned for the site": js/tree.js 4·. The
  // plaza's façade, patio and elevation plans and its 1980 site plan are the site's other activity,
  // a development of their own beside this one: js/sites.js, step 2.)
  assert.deepEqual([s.files, s.root, s.units, s.check, s.onLand, s.sameLand], [7, 'OZS-2025-0022', 7641, 1, 2, 4]);
  const h = T.treeHTML(d, null, { dot: k => `<i class="dot" data-k="${k}"></i>` });
  assert.match(h, /<button type="button" class="tr-ref" data-dev-file="OZS-2025-0022" title="Its source record, in History">OZS-2025-0022<\/button>[\s\S]*?<b>7,641<\/b>homes · counted here/);
  assert.equal((h.match(/<button type="button" class="tr-check"/g) || []).length, 1, "one link to check, opening its record"); assert.equal((h.match(/<span class="tr-check"/g) || []).length, 1, "and the key line");
  assert.match(h, /<details class="tr-same"><summary>\+ 4 earlier files on the same land: the site's history, not counted<\/summary>/);
  assert.match(T.summaryHTML(d), /^<b>7<\/b> files · homes counted on <b>OZS-2025-0022<\/b>/);
  assert.match(T.summaryHTML(d), /<span class="tr-check"[^>]*>check<\/span> 1 link$/);
  const site = TREE.devs.find(x => x.st === 'Brampton|295 QUEEN ST E' && x.sa);
  assert.ok(site && site.n.some(n => n[0] === 'SPA-2026-0003'), 'the Dollarama façade is the site\'s other activity');
});

test('file tree: a block plan that states no count adds up its draft plans, and they come first', () => {
  const d = dev('Brampton|2055 BOVAIRD DR W');
  const s = T.summary(d);
  assert.equal(s.top, 'PRE-2023-0100'); assert.equal(s.counted.length, 4);
  assert.equal(s.counted.reduce((t, c) => t + c.units, 0), s.units, 'the parts add up to the development');
  assert.deepEqual(T.build(d).root.kids.slice(0, 4).map(k => k.ref), ['OZS-2025-0034', 'OZS-2024-0051', 'OZS-2025-0032', 'C05W07.006']);
  const h = T.treeHTML(d, null, { limit: 4 });
  assert.match(h, /<b>9,862<\/b>homes in all, on the files below/);
  assert.match(h, /<b>2,929<\/b>homes · counted here \(estimate\)/);
  assert.match(T.summaryHTML(d), /homes counted on 4 files, most on <b>OZS-2025-0034<\/b>/);
  assert.deepEqual(T.estimateOf(d), { ref: 'OZS-2024-0051', units: 2929, kind: 'online', source: 'Brampton PDC agenda / recommendation report, 2025-10-06 (checked 2026-10-17: the municipal notice for this file states it)' });
});

test('Records › Files: the tree, then the latest activity; Growth: the developments table’s rows open the site; estimate rows name their file', () => {
  const r = src('js/records-tab.js');
  assert.match(r, /chart: `<h3 class="sub-title pnl-chart-t">How the files fit together <span class="pnl-chart-u">\(each under the file whose land holds it\)<\/span><\/h3>\$\{FT\.treeHTML\(d, recOf,/);
  assert.match(r, /lists: \[\.\.\.siteList, \{ title: 'Latest activity', rows: latest,/);
  assert.match(r, /label: 'to check', ctx: 'linked by overlap only'/);
  const w = src('js/ws-pages.js');
  assert.match(w, /title: gStage === 'all' \? `Developments in \$\{n\.name\}` : `\$\{STG\[gStage\]\}: developments in \$\{n\.name\}`/);
  assert.doesNotMatch(w, /`Files in \$\{n\.name\}`/);
  // A row of the developments table opens the site (js/dev-table.js).
  assert.match(src('js/dev-table.js'), /<tr class="gt-r" data-ws-pick="\$\{esc\(r\.key\)\}" data-ws-as="site"/);
  assert.match(w, /<small class="tr-sum">the estimate is on <b>\$\{esc\(e\.ref\)\}<\/b>/);
  assert.match(w, /const had = files\.find\(f => f\.p === p\);/, 'one estimate row per development');
  assert.match(src('js/workspaces.js'), /if \(pk && pk\.dataset\.wsTree\) \{ e\.preventDefault\(\); setMode\('full'\); pickDev\(pk\.dataset\.wsPick\); setTimeout\(\(\) => \{ const AT = root\.PeelAnalysisTabs; if \(AT && AT\.openTab\) AT\.openTab\('records', 'files'\);/);
  // The header's flags: "n links to check" opens the tree.
  assert.match(src('js/dev-detail.js'), /data-tree-check title="Files linked to this development by overlap only/);
  assert.match(src('index.html'), /<script src="js\/file-tree\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/file-tree\.js',/);
});

test('10 or fewer homes with zoning approved: Approved, explained where the stage is set', () => {
  for (const f of ['js/devtab.js', 'js/fsr.js']) assert.match(src(f), /except a site of 10 or fewer homes, which needs no site plan since Bill 23/, f);
  assert.match(src('js/panel.js'), /\$\{p\.smallSite \? ' · no site plan needed' : ''\}/);
  assert.match(src('js/approvals-guide.js'), /\[3, 1, 'ok', '≤ 10 homes: zoning approved → Approved'/);
});

test('the holding (H) symbol: an application to lift it is flagged on the site (open, or lifted)', () => {
  const P = require('../js/phases.js');
  assert.equal(P.isHolding({ kind: 'application', ref: 'H-OZ 25-1' }), true, 'Mississauga H-OZ');
  assert.equal(P.isHolding({ kind: 'application', ref: 'OZS-2026-0030', type: 'OPA ZBA Subdivision', description: 'Lifting of Hold — Lifting of Holding Symbol Application' }), true, 'Brampton "Lifting of Hold"');
  assert.equal(P.isHolding({ kind: 'application', ref: 'SPA-1', description: 'Holding tank for storm water' }), false);
  assert.equal(P.isHolding({ kind: 'permit', ref: 'H-OZ 1' }), false);
  const s = src('js/phases.js');
  assert.match(s, /const holding = holds\.length \? \{ refs: holds\.map\(r => r\.ref\)\.filter\(Boolean\), open: holds\.some/);
  assert.match(src('js/dev-detail.js'), /`Holding \(H\): removal in review \(\$\{esc\(p\.holding\.refs\[0\] \|\| 'file'\)\}\)`/);
});

test('Help is a page in Home’s layout: start here by role, what each tab answers, guides, tour, change log, glossary', () => {
  const s = src('js/tips.js');
  assert.match(s, /return \{ id: 'help', eyebrow: 'Help', name: 'How do I use this\?'/);
  for (const h of ['Start here', 'What each tab answers', 'Task guides', 'More help', 'Quick tips']) assert.ok(s.includes(`<h3 class="ws-h">${h}</h3>`), h);
  assert.match(s, /<div id="help-log-body" aria-live="polite"><\/div>/, 'the change log renders on the page');
  assert.match(s, /data-ws-page="glossary">Glossary<\/button>/);
  // (the roles by start here: Help's own list of four, removed by design (§5 row 157: one ROLES list), is the one list's
  // six, each picked here)
  const hp = s.slice(s.indexOf('  function helpPage() {'), s.indexOf('  // The Help button, the tour'));
  assert.match(hp, /roles\(\)\.map\(r => /); assert.match(s, /const roles = \(\) => \(root\.PeelWorkspaces && root\.PeelWorkspaces\.ROLES\) \|\| \[\];/);
  assert.match(hp, /data-role-pick="\$\{esc\(r\.key\)\}"/);
  assert.doesNotMatch(s, /\bconst (ROLES|ASKS) = /);
  assert.match(src('js/workspaces.js'), /const REF = \{ help: \{ label: 'Help', what: 'Start here, guides, the tour, what’s new' \}/);
  assert.match(src('js/ws-pages.js'), /const help = \(\) => \(root\.PeelTips && root\.PeelTips\.helpPage \? root\.PeelTips\.helpPage\(\) : loading\('help', 'Loading…'\)\);/);
});

test('counting in one place: the Scenario control names Units per development (the tree count; the Previous switch is retired, owner decision 14); the map loads say when the Stage filter limits them', () => {
  const B = require('../js/layer-bar.js');
  const base = { basis: 'all', flows: '2025 metered', md: 'design', outside: 'nearest', year: 2026, yearDefault: 2026, criteria: 0, count: 'tree count' };
  assert.equal(B.scenarioChipText(B.scenarioSettings({ ...base, loads: 'every stage' })), 'Default');
  const lim = B.scenarioSettings({ ...base, loads: 'built + committed only (Stage filter)' });
  assert.equal(B.scenarioChipText(lim), '1 change', 'a Stage filter that drops a stage from the loads is a change, said in the chip');
  assert.match(B.scenarioListHTML(lim), /Map loads from<\/span> <b>built \+ committed only \(Stage filter\)<\/b>/);
  // (removed by design: the switch; the row it fed is asserted instead)
  assert.doesNotMatch(src('js/svc-tab.js'), /PeelTreeCounts\.settingsHTML/);
  assert.doesNotMatch(src('js/tree-counts.js'), /id="count-mode"|function setMode\(|function settingsHTML\(/);
  assert.doesNotMatch(src('js/settings.js'), /count-mode/);
  assert.ok(B.scenarioSettings(base).some(r => r.key === 'countMode' && r.value === 'tree count' && r.def), 'Units per development: tree count, the default');
  // Settings: Display → Start screen → Your role → Reports → Labs → Usage (⚙'s one sheet, navigation phase 7, design
  // §3.7). The Counting pointer to the Scenario control, removed by design (§5 row 170): counting is the Scenario
  // control's own (the row above).
  const g = src('js/growth-ui.js');
  assert.match(g, /<h2 class="pane-h">Settings<\/h2>\$\{displaySettingsHTML\(\)\}\$\{root\.PeelWorkspaces && root\.PeelWorkspaces\.settingsHTML \? root\.PeelWorkspaces\.settingsHTML\(\) : ''\}\$\{DU\(\)\.reportSettingsHTML\(\)\}\$\{root\.PeelLabs && root\.PeelLabs\.pageHTML \? root\.PeelLabs\.pageHTML\(\) : ''\}\$\{root\.PeelUsage && root\.PeelUsage\.settingsHTML \? root\.PeelUsage\.settingsHTML\(\) : ''\}`;/);
  assert.doesNotMatch(g, /set-counting|const counting = /);
});

test('the Data tab folds into Records; Records leaves the gear', () => {
  const html = src('index.html');
  assert.doesNotMatch(html, /id="tab-data"|data-tab="data"/);
  assert.match(src('js/records-tab.js'), /function showData\(which\) \{/);
  assert.match(src('js/data-tab.js'), /if \(name === 'data' \|\| !document\.getElementById\('tab-' \+ name\)\) name = 'explore';/, 'a stored or linked Data tab opens Find');
  assert.doesNotMatch(src('js/topbar.js'), /data-tbg="records"/);
  // The Watch tab: the watchlist and its alerts; what changed is on the This week page.
  assert.match(html, /<button type="button" class="btn small" data-ws-page="week">This week: what changed →<\/button>/);
});

test('views save in one place, beside the share link; they open (and delete) from the chips at the top of Find', () => {
  const t = src('js/topbar.js');
  assert.match(t, /'<button type="button" role="menuitem" data-share>Copy share link<\/button>' \+\n {6}'<button type="button" role="menuitem" data-tbx="saveview">Save this view…<\/button>';/);
  assert.doesNotMatch(src('js/filter-ui.js'), /id="f-saveview"/);
  assert.doesNotMatch(src('js/map-markers.js'), /id="opt-saved"/);
  const m = src('js/map-analysis.js');
  assert.match(m, /data-preset-del="\$\{i\}" aria-label="Delete the saved view/);
  assert.match(src('js/search-filter.js'), /const d = e\.target\.closest\('\[data-preset-del\]'\); if \(d\) \{ MA\(\)\.deleteSavedView\(\+d\.dataset\.presetDel\); return; \}/);
});

test('the trail owns the scope’s count; the filters on are the trail’s, on pages and the map; Review an FSR starts from the files with an FSR', () => {
  assert.match(src('js/topbar.js'), /const count = scoped \? `<span class="tb-count" title="This development's planned homes">· \$\{fmtNum\(Math\.round\(devU\)\)\} home/);
  // (navigation phase 6: the pages' and the workspace bar's "Filters on" row is the trail's "k filters" popover;
  // the row itself is removed by design, §5 row 54)
  const t = src('js/topbar.js');
  assert.match(t, /<div class="page-filters small" role="group" aria-label="Filters on">\$\{k \? `<span class="muted">Filters on:<\/span>/);
  assert.match(t, /data-tb-filters aria-expanded=/);
  assert.doesNotMatch(src('js/workspaces.js'), /filterChipsHTML|m\.filters/);
  assert.doesNotMatch(src('js/ws-pages.js'), /m\.filters/);
  assert.doesNotMatch(src('index.html'), /id="ws-filters"/);
  assert.match(src('index.html'), /<div class="tb-pop tb-fl-pop" id="tb-fl-pop" hidden><\/div>/);
  const p = src('js/ws-pages.js');
  assert.match(p, /\{ title: 'Files with an FSR posted', rows: fsrRows/);
  // (the Find step's search is the page header's, as on every page: one slot, js/ws-pages.js pageHTML)
  assert.match(p, /top: stepper,/);
  assert.equal((p.match(/id="page-search"/g) || []).length, 1, 'one search slot, in the page header (pageHTML)');
  assert.doesNotMatch(p.slice(p.indexOf('  function find(id) {'), p.indexOf('  // ---- Check a site, with a site')), /title: 'Steps'/, 'the steps are one line, not a list');
});

test('the Layers panel splits the network from the capital program; a map view opens its tab; list values read as numbers', () => {
  const LG = require('../js/layer-groups.js');
  assert.deepEqual(LG.GROUPS.map(g => g.label), ['Developments', 'Capacity', 'Existing network', 'Capital program', 'Constraints', 'Planning context', 'Base map']);
  assert.match(src('js/topbar.js'), /const tab = \{ dc: 'dca', water: 'svc', wastewater: 'svc' \}\[b\.dataset\.mview\];/);
  assert.match(src('css/app.css'), /\.pnl-r-year \{ font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; \}/);
});

// (Help's "What each workspace answers", ASKS, its third copy of the questions, is removed by design, §5 row 158: the
// table is drawn from Home's views, js/sections.js VIEWS.area, and the question each heads with, ASK)
test('Help › What each tab answers lists every view of Home, each with its question', () => {
  const t = src('js/tips.js'), S = require('../js/sections.js');
  assert.deepEqual(Object.keys(S.ASK), Object.keys(S.VIEWS.area), 'one question per view, none extra');
  for (const [k, q] of Object.entries(S.ASK)) assert.match(q, /^[A-Z][^?]*\?$/, k);
  const hp = t.slice(t.indexOf('  function helpPage() {'), t.indexOf('  // The Help button, the tour'));
  assert.match(hp, /Object\.keys\(\(SE && SE\.VIEWS && SE\.VIEWS\.area\) \|\| \{\}\)\.map\(key => /);
  assert.match(hp, /<td>\$\{esc\(SE\.ASK\[key\] \|\| ''\)\}<\/td>/);
  assert.doesNotMatch(t, /const ASKS = /);
});

// Navigation phase 7 (design §3.7, §5 rows 157, 158, 164–166; N-9 with change): Help is four sections; Start here
// has the six roles of the one list, each with its shortcuts and "This is my role", and Records' sources and checks
// (Home's Records tab); What each tab answers is every view of Home; one name, Help.
function loadTips(stored = {}) {
  const store = new Map(Object.entries(stored)), W = require('../js/workspaces.js'), SE = require('../js/sections.js'), U = require('../js/util.js');
  const document = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { classList: { contains: () => false } } };
  const window = { document, PeelUtil: { $: () => null, esc: U.esc, store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) } }, PeelWorkspaces: W, PeelSections: SE };
  const ctx = { window, document, module: { exports: {} }, setTimeout: () => 0, addEventListener() {}, removeEventListener() {} }; ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/tips.js'), ctx);
  return ctx.module.exports;
}
test('Help is four sections: Start here has the six roles with their shortcuts and This is my role, and Records’ sources and checks; What each tab answers is every view of Home', () => {
  const W = require('../js/workspaces.js'), SE = require('../js/sections.js'), U = require('../js/util.js');
  assert.deepEqual(SE.WORKSPACES.reference.secs.map(s => [s.id, s.title, s.page]), [['help', 'Start here', 'help'], ['guides', 'How it works', 'guides'], ['glossary', 'Glossary', 'glossary'], ['logic', 'How the app decides', 'logic']]);
  const m = loadTips({ role: 'qa' }).helpPage();
  assert.equal(m.eyebrow, 'Help');
  const cards = [...m.mid.matchAll(/<div class="help-role( on)?"><strong>([^<]+)<\/strong><small>[^<]+<\/small><div>([^]*?)<\/div><button type="button" class="btn small link" data-role-pick="(\w+)" aria-pressed="(true|false)">([^<]+)<\/button><\/div>/g)];
  assert.deepEqual(cards.map(c => c[4]), W.ROLES.map(r => r.key), 'the six, in the one list’s order');
  for (const [c, r] of cards.map((c, i) => [c, W.ROLES[i]])) {
    assert.equal(c[2], U.esc(r.label));
    const btns = [...c[3].matchAll(/<button type="button" class="btn small"([^>]*)>([^<]+)<\/button>/g)];
    assert.deepEqual(btns.map(b => b[2]), r.links.map(l => U.esc(l.label)), `${r.key}: its shortcuts`);
    assert.deepEqual(btns.map(b => Object.fromEntries([...b[1].matchAll(/ ([\w-]+)="([^"]*)"/g)].map(x => [x[1], x[2]]))), r.links.map(l => W.roleAttrs(l)), `${r.key}: each opens what the menu’s shortcut does`);
    assert.deepEqual([!!c[1], c[5], c[6]], r.key === 'qa' ? [true, 'true', 'Your role'] : [false, 'false', 'This is my role'], r.key);
  }
  assert.match(m.mid, /Data sources and checks are Home’s Records tab: <button type="button" class="btn small link" data-ws-page="home" data-ws-at="records:sources">Records › Sources<\/button> · <button type="button" class="btn small link" data-ws-page="home" data-ws-at="records:checks">Records › Data checks<\/button>/);
  // What each tab answers: one row per view of Home, its question; Overview Home itself, the rest at their view.
  const rows = [...m.mid.matchAll(/<tr><th scope="row"><button type="button" class="btn small link" data-ws-page="home"(?: data-ws-at="([\w:]+)")?>([^<]+)<\/button><\/th><td>([^<]+)<\/td><\/tr>/g)];
  assert.deepEqual(rows.map(r => r[1] || 'overview:'), Object.keys(SE.VIEWS.area));
  assert.deepEqual(rows.map(r => r[3]), Object.values(SE.ASK).map(U.esc));
  assert.deepEqual(rows.slice(0, 3).map(r => r[2]), ['Overview', 'Growth › Pipeline', 'Growth › Areas']);
  assert.equal(rows.find(r => r[1] === 'records:checks')[2], 'Records › Data checks');
  assert.match(m.mid, /<tr><th scope="row">A development’s page \(Find\)<\/th><td>The same five tabs, for one development\.<\/td><\/tr><\/tbody><\/table>/);
  assert.doesNotMatch(m.mid.slice(0, m.mid.indexOf('<h3 class="ws-h">Task guides</h3>')) + m.answer, /workspace/i, 'Start here and the table: the tabs’ and Find’s words, no workspace');
  assert.deepEqual([...m.mid.matchAll(/<h3 class="ws-h">([^<]+)<\/h3>/g)].map(x => x[1]), ['Start here', 'What each tab answers', 'Task guides', 'More help', 'Quick tips']);
  // No role picked: no card is marked.
  assert.doesNotMatch(loadTips().helpPage().mid, /help-role on|aria-pressed="true"/);
  // One name, Help (§3.9): no eyebrow or link says Reference.
  for (const f of ['js/tips.js', 'js/reference.js', 'js/glossary.js', 'js/logic.js', 'js/approvals-guide.js']) assert.doesNotMatch(src(f), /eyebrow: 'Reference'|Reference · <button|More reference/, f);
  // A phone: the cards one column (220 px), their buttons wrapping (a .btn is nowrap).
  const css = src('css/app.css');
  assert.match(css, /\.help-roles \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(220px, 1fr\)\);/);
  assert.match(css, /\.help-role \.btn \{ white-space: normal; text-align: left; \}/);
  assert.match(css, /\.help-role\.on \{ box-shadow: inset 3px 0 0 var\(--accent\); \}/);
});
