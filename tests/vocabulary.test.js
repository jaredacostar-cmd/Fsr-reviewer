'use strict';
// Design bundle 2 — one vocabulary: the development's stage in one set of words everywhere; never
// "Approved" alone; no two sub-views share a name; Help names only places that exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
const P = require('../js/phases.js');
const B = require('../js/layer-bar.js');

test('one stage name per development, the same words as the counting stages', () => {
  assert.deepEqual(plain(P.ALL_PHASES.map(p => p.label)), ['Pre-application', 'In review', 'Plan approved', 'Building permit', 'Under construction', 'Built', 'Withdrawn / refused']);
  // The counting stages use the same words (Pre-application, In review); "Approved" never alone.
  assert.equal(B.LABEL.anticipated, P.PHASE_BY_KEY.inception.label);
  assert.equal(B.LABEL.proposed, P.PHASE_BY_KEY.review.label);
  for (const t of [...Object.values(B.SHORT), ...Object.values(B.LABEL), ...P.ALL_PHASES.map(p => p.label)]) assert.notEqual(t.trim(), 'Approved', 'never "Approved" alone');
  // A badge says the stage once; Built says which side of census day.
  assert.equal(B.stageText({ phase: 'review' }, { layer: 'proposed' }), 'In review');
  assert.equal(B.stageText({ phase: 'completed' }, { layer: 'built' }), 'Built since 2021');
  assert.equal(B.stageText({ phase: 'completed' }, { layer: 'existing' }), 'Built before the 2021 census');
  const r = src('js/render-list.js');
  assert.doesNotMatch(r, /PHASE_BY_KEY\[p\.phase\]\.label\)\}\$\{window\.PeelLayerBar \? ` → /, 'no "In review → In review" on list rows');
  assert.match(r, /\{ keys: pc\.map\(x => x\.key\), label: 'Permit \/ under construction' \}/, 'one sidebar row per stage');
});

test('the words "phase" and "layer" are not shown for a development’s stage or its counting', () => {
  assert.match(src('js/map-analysis.js'), /\$\{b\('phase', 'Stage'\)\}\$\{b\('layer', 'Counted as'\)\}/);
  assert.match(src('js/growth-ui.js'), /data-info="growth-layers">Homes by stage </);
  assert.match(src('js/map-markers.js'), /color: \{ phase: 'Stage', layer: 'Counted as',/);
  for (const f of ['js/overview-tab.js', 'js/tools-corridor.js', 'js/reports.js', 'js/svc-plants.js']) assert.doesNotMatch(src(f), /<th>Phase<\/th>|<th>Layer<\/th>/, f);
  assert.doesNotMatch(src('js/reports.js'), /by phase</i);
});

test('no two sub-views share a name; the chips, the trails and the source lines agree', () => {
  const html = src('index.html');
  const chips = tab => { const i = html.indexOf('f-subtabs', html.indexOf(`data-pane="${tab}" hidden role="group"`) - 80); return [...html.slice(i, html.indexOf('</div>', i)).matchAll(/data-(?:gsub|svcsub|dcasub|rsub)="\w+">([^<]+)</g)].map(m => m[1].trim()); };
  const all = ['growth', 'svc', 'dca', 'records'].flatMap(chips);
  assert.equal(new Set(all).size, all.length, `duplicate sub-view names: ${all.join(', ')}`);
  assert.deepEqual(chips('growth'), ['Pipeline', 'Areas', 'Forecast']);
  assert.deepEqual(chips('svc'), ['Capacity', 'Network', 'Old pipes', 'FSR review']); assert.ok(chips('records').includes('Data checks') && chips('dca').includes('DC timing'));
  const W = require('../js/workspaces.js');
  assert.equal(W.tabPath('svc', 'network'), 'Servicing › Network');
  assert.equal(W.tabPath('svc', 'fsr'), 'Servicing › FSR review');
  assert.equal(W.tabPath('svc', 'pipes'), 'Servicing › Old pipes', '(navigation phase 6c: the workspace’s name, one name)');
  assert.equal(W.tabPath('records', 'checks'), 'Records › Data checks');
  assert.equal(W.tabPath('records', 'files'), 'Records', 'a development’s files and history: Records, one view (§3.9: no Files page section)'); assert.equal(W.chipName('records', 'files'), 'Files');
  assert.doesNotMatch(src('js/workspaces.js'), /'svc:checks'|alloc: 'Allocations'/, 'no name for a sub-view that is gone');
  assert.doesNotMatch(src('js/workspaces.js'), /ledger: 'Ledger'/, 'no name for a sub-view that is gone');
  assert.equal(W.tabPath('growth', 'timing'), 'Growth › Forecast');
  assert.equal(W.tabPath('dca', 'timing'), 'Capital › DC timing');
  assert.ok(W.WS.some(w => w.id === 'projects' && w.label === 'DC projects'));
  for (const [f, re] of [['js/timing.js', /areaHead\('Growth › Forecast'/], ['js/dc-projects.js', /areaHead\('Capital › DC timing', 'Is each DC project in time\?'/], ['js/svc-capacity.js', /areaHead\('Servicing › Network'/], ['js/records-tab.js', /areaHead\('Records › Data checks'/]]) assert.match(src(f), re, f);
  assert.doesNotMatch(src('js/svc-capacity.js') + src('js/demand-ui.js'), /areaHead\('Servicing › (Model checks|Allocations)'/);
  // (navigation phase 4: DC projects is DC timing, the funding screen its fold)
  assert.doesNotMatch(src('js/dc-projects.js') + src('js/dca-tab.js'), /areaHead\('Capital › (DC projects|Funding)'/, 'no head names a gone sub-view');
  assert.doesNotMatch(src('js/workspaces.js'), /dcproj: 'DC projects'/, 'no name for a sub-view that is gone');
});

test('Help names only places that exist (tab › sub-view), and none of the old ones', () => {
  const tips = src('js/tips.js'), html = src('index.html');
  const HELP = tips.slice(tips.indexOf('const HELP = ['), tips.indexOf('const MOVED = ['));
  const MOVED = new Function(`${tips.match(/const MOVED = \[[\s\S]*?\n {2}\];/)[0]}; return MOVED;`)();
  const now = MOVED.flatMap(g => g.rows.map(r => r[1])).join(' ');
  const TAB = { Growth: 'growth', Servicing: 'svc', Capital: 'dca', Records: 'records' };
  const chips = tab => { const i = html.indexOf('f-subtabs', html.indexOf(`data-pane="${tab}" hidden role="group"`) - 80); return [...html.slice(i, html.indexOf('</div>', i)).matchAll(/data-(?:gsub|svcsub|dcasub|rsub)="\w+">([^<]+)</g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s*Labs$/, '').trim()); };
  const names = [...`${HELP} ${now}`.matchAll(/\b(Growth|Servicing|Capital|Records) › ([A-Z][A-Za-z&]*(?: [a-z&][a-z]*)*)/g)];
  assert.ok(names.length > 8, 'Help names its places');
  for (const [, tab, sub] of names) assert.ok(chips(TAB[tab]).some(c => sub.startsWith(c)), `"${tab} › ${sub}" is not a sub-view (${chips(TAB[tab]).join(', ')})`);
  for (const old of ['DC needs:', 'Development tab', 'Layers & style', 'Data tab:', 'DC map view', 'This week tab', 'Definitions (Overview', 'Inception', 'Under review', 'Draft / site plan approved', 'More settings → Existing']) assert.ok(!HELP.includes(old), `Help still says "${old}"`);
  // (the help strings outside Help: info, the tool rail, the scenario control)
  for (const [f, old] of [['js/info.js', 'Settings (gear menu) → Records'], ['js/info.js', 'The Development tab lists the nearest'], ['js/info.js', 'screen button under the map tools'], ['js/area-select.js', 'select developments within a radius'], ['js/svc-tab.js', 'Wastewater → Plants & capacity'], ['js/tools-upgrade.js', 'Open the Wastewater tab'], ['js/tips.js', 'grouped: Planning, Capital, Asset Management'], ['js/tips.js', 'grouped: Planning'], ['js/tips.js', 'Explore, in the menu'], ['js/reference.js', "label: 'Servicing capacity'"], ['js/reference.js', "label: 'Growth in an area'"], ['js/reference.js', "label: 'Review an FSR'"], ['js/reference.js', "label: 'Check a site'"], ['js/reference.js', "label: 'DC projects'"], ['js/ws-pages.js', 'Open Servicing capacity on the map'], ['js/ledger-ui.js', 'Explore › Growth in an area'], ['js/growth-ui.js', 'see Census & 2051'], ['js/records-tab.js', 'was the Data tab'], ['js/reference.js', 'The <strong>DC projects</strong> page'], ['js/reference.js', '(Servicing capacity)'], ['js/usage.js', 'workspace map'], ['js/usage.js', 'How often each workspace'], ['js/tips.js', 'year slider in the legend'], ['js/tips.js', 'Scenario line'], ['js/tips.js', 'Scenario bar'], ['js/tips.js', 'in the sidebar)'], ['js/tips.js', 'Flags (sidebar)'], ['js/timing.js', 'on the Wastewater tab'], ['js/svc-plants.js', 'the Plants tab chart'], ['js/svc-tab.js', 'in the Plants tab'], ['js/area-select.js', 'the bottom panel'], ['js/ws-pages.js', 'the same test as Capital › Timing'], ['js/usage.js', '(sidebar)'], ['js/map-analysis.js', 'selected in the sidebar'], ['index.html', 'aria-label="Sidebar"']]) assert.ok(!src(f).includes(old), `${f} still says "${old}"`);
});

// Navigation phase 9 (design §5 row 167): every "What is this?" card is shown somewhere: its key is in index.html or a
// module (a data-info, or the arrays and helpers that write one), or it is a stage's or a municipality's card, written
// from the key (data-info="phase-${key}", "muni-${m}"). The cards nothing showed went.
test('every info card has a producer; the orphans are gone', () => {
  const ctx = { window: {}, self: {} }; ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/info.js'), ctx);
  const I = (ctx.window.PeelInfo || ctx.PeelInfo).INFO;
  const code = ['index.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js') && x !== 'info.js').map(x => `js/${x}`)].map(src).join('\n');
  const DYN = { phase: P.ALL_PHASES.map(p => p.key), muni: ['all', 'Mississauga', 'Brampton', 'Caledon'] };
  for (const k of Object.keys(I)) {
    const [fam, ...rest] = k.split('-');
    assert.ok(new RegExp(`['"\`]${k}['"\`]`).test(code) || (DYN[fam] || []).includes(rest.join('-')), `info card "${k}": nothing shows it`);
  }
  for (const k of ['tab-water', 'tab-ww', 'tab-dev', 'tab-log', 'tab-demand', 'tab-criteria', 'tab-developments', 'record-settings', 'map-tools', 'focus', 'legend']) assert.equal(I[k], undefined, `${k}: an orphan, removed`);
  for (const k of ['tab-overview', 'tab-growth', 'tab-servicing', 'tab-dca', 'tab-records', 'definitions', 'phase-review', 'muni-all']) assert.ok(I[k], k);
});

// Navigation phase 9 (design §3.7, §3.9): a tool's output is a result, a scope of its own on Overview; the words
// "Tool result tab" (and its pane) name nothing. The old name lives only in What moved where's first column (§3.1 rule 4).
test('no "Tool result tab" anywhere: a result is a scope on Overview', () => {
  const OLD = /Tool result (tab|pane)/i;
  const files = ['README.md', 'docs/guide/README.md', 'docs/method/README.md', 'docs/data/README.md', ...fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js') && x !== 'tips.js').map(x => `js/${x}`)];
  for (const x of files) assert.doesNotMatch(src(x), OLD, x);
  const t = src('js/tips.js'), block = t.match(/const MOVED = \[[\s\S]*?\n {2}\];/)[0];
  const MOVED = new Function(`${block}; return MOVED;`)();
  assert.doesNotMatch(t.replace(block, '') + MOVED.flatMap(g => g.rows.map(r => r[1])).join(' '), OLD, 'js/tips.js (outside What moved where’s first column)');
});
