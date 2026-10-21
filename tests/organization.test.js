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

test('Records › Files: the tree, then the latest activity; Growth rows: one stage, the files line, ▸ the tree; estimate rows name their file', () => {
  const r = src('js/records-tab.js');
  assert.match(r, /chart: `<h3 class="sub-title pnl-chart-t">How the files fit together <span class="pnl-chart-u">\(each under the file whose land holds it\)<\/span><\/h3>\$\{FT\.treeHTML\(d, recOf,/);
  assert.match(r, /lists: \[\{ title: 'Latest activity', rows: latest,/);
  assert.match(r, /label: 'to check', ctx: 'linked by overlap only'/);
  const w = src('js/ws-pages.js');
  assert.match(w, /title: gStage === 'all' \? `Developments in \$\{n\.name\}` : `\$\{STG\[gStage\]\}: developments in \$\{n\.name\}`/);
  assert.doesNotMatch(w, /`Files in \$\{n\.name\}`/);
  // "In review · In review": the stage once.
  const body = w.slice(w.indexOf('    const stageLine = x =>'), w.indexOf('    const treeBits = p =>'));
  const stageLine = new Function('STG', 'Ph', 'esc', `${body}; return stageLine;`)({ review: 'In review', permitted: 'Permit issued / building' }, { PHASE_BY_KEY: { review: { label: 'In review' }, construction: { label: 'Under construction' } } }, s => s);
  assert.equal(stageLine({ st: 'review', p: { phase: 'review' } }), 'In review');
  assert.equal(stageLine({ st: 'permitted', p: { phase: 'construction' } }), 'Permit issued / building · Under construction');
  assert.match(w, /data-tr-tog="\$\{esc\(p\.key\)\}" aria-expanded="\$\{on\}"/);
  assert.match(w, /<small class="tr-sum">the estimate is on <b>\$\{esc\(e\.ref\)\}<\/b>/);
  assert.match(w, /const had = files\.find\(f => f\.p === p\);/, 'one estimate row per development');
  assert.match(src('js/workspaces.js'), /if \(pk && pk\.dataset\.wsTree\) \{ e\.preventDefault\(\); setMode\('full'\); pickDev\(pk\.dataset\.wsPick\); setTimeout\(\(\) => \{ const AT = root\.PeelAnalysisTabs; if \(AT && AT\.openTab\) AT\.openTab\('records', 'files'\);/);
  // The site bar: "n links to check" opens the tree.
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

test('Help is a page in Home’s layout: start here by role, what each workspace answers, guides, tour, change log, glossary', () => {
  const s = src('js/tips.js');
  assert.match(s, /return \{ id: 'help', eyebrow: 'Reference', name: 'How do I use this\?'/);
  for (const h of ['Start here', 'What each workspace answers', 'Task guides', 'More help', 'Quick tips']) assert.ok(s.includes(`<h3 class="ws-h">${h}</h3>`), h);
  assert.match(s, /<div id="help-log-body" aria-live="polite"><\/div>/, 'the change log renders on the page');
  assert.match(s, /data-ws-page="glossary">Glossary<\/button>/);
  assert.match(s, /\['Infrastructure planner or engineer', 'Screen an application, an FSR or a pre-consultation\.', \['site', 'fsr', 'tight'\]\]/);
  assert.match(src('js/workspaces.js'), /const REF = \{ help: \{ label: 'Help', what: 'Start here, guides, the tour, what’s new' \}/);
  assert.match(src('js/ws-pages.js'), /const help = \(\) => \(root\.PeelTips && root\.PeelTips\.helpPage \? root\.PeelTips\.helpPage\(\) : loading\('help', 'Loading…'\)\);/);
});

test('counting in one place: the Scenario control holds Units per development; the map loads say when the Stage filter limits them', () => {
  const B = require('../js/layer-bar.js');
  const base = { basis: 'all', flows: '2025 metered', md: 'design', outside: 'nearest', year: 2026, yearDefault: 2026, criteria: 0, count: 'tree count' };
  assert.equal(B.scenarioChipText(B.scenarioSettings({ ...base, loads: 'every stage' })), 'Default');
  const lim = B.scenarioSettings({ ...base, loads: 'built + committed only (Stage filter)' });
  assert.equal(B.scenarioChipText(lim), '1 change', 'a Stage filter that drops a stage from the loads is a change, said in the chip');
  assert.match(B.scenarioListHTML(lim), /Map loads from<\/span> <b>built \+ committed only \(Stage filter\)<\/b>/);
  assert.match(src('js/svc-tab.js'), /\$\{root\.PeelTreeCounts && root\.PeelTreeCounts\.settingsHTML \? root\.PeelTreeCounts\.settingsHTML\(\) : ''\}/);
  // Settings: Display → Start screen → Counting (a pointer to the Scenario control) → Usage.
  const g = src('js/growth-ui.js');
  assert.match(g, /<h2 class="pane-h">Settings<\/h2>\$\{displaySettingsHTML\(\)\}\$\{root\.PeelWorkspaces && root\.PeelWorkspaces\.settingsHTML \? root\.PeelWorkspaces\.settingsHTML\(\) : ''\}\$\{counting\}\$\{root\.PeelUsage/);
  assert.match(g, /is set in the Scenario control, with the other scenario settings\. <button type="button" class="btn small" data-pnl-scen>Open the Scenario control<\/button>/);
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

test('the trail owns the scope’s count; filters on show on pages; Review an FSR starts from the files with an FSR', () => {
  assert.match(src('js/topbar.js'), /const count = scoped \? `<span class="tb-count" title="This development's planned homes">· \$\{fmtNum\(Math\.round\(devU\)\)\} home/);
  const w = src('js/workspaces.js');
  assert.match(w, /<div class="page-filters small" role="group" aria-label="Filters on"><span class="muted">Filters on:<\/span>/);
  assert.match(w, /if \(!REF\[page\]\) m\.filters = filterChipsHTML\(\);/);
  assert.match(src('js/ws-pages.js'), /if \(m\.filters\) out\.push\(m\.filters\);/);
  assert.match(src('index.html'), /<div class="ws-filters" id="ws-filters"><\/div>/);
  const p = src('js/ws-pages.js');
  assert.match(p, /\{ title: 'Files with an FSR posted', rows: fsrRows/);
  assert.match(p, /top: `<div class="page-search" id="page-search"><\/div>\$\{stepper\}`/);
  assert.doesNotMatch(p.slice(p.indexOf('  function find(id) {'), p.indexOf('  // ---- Check a site, with a site')), /title: 'Steps'/, 'the steps are one line, not a list');
});

test('the Layers panel splits the network from the capital program; a map view opens its tab; list values read as numbers', () => {
  const LG = require('../js/layer-groups.js');
  assert.deepEqual(LG.GROUPS.map(g => g.label), ['Developments', 'Capacity', 'Existing network', 'Capital program', 'Constraints', 'Planning context', 'Base map']);
  assert.match(src('js/topbar.js'), /const tab = \{ dc: 'dca', water: 'svc', wastewater: 'svc' \}\[b\.dataset\.mview\];/);
  assert.match(src('css/app.css'), /\.pnl-r-year \{ font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; \}/);
});
