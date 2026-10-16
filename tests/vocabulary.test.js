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
  assert.deepEqual(plain(P.ALL_PHASES.map(p => p.label)), ['Pre-application', 'In review', 'Approved, no permit yet', 'Permit issued', 'Under construction', 'Built', 'Withdrawn / refused']);
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
  assert.match(src('js/growth-ui.js'), /data-info="growth-layers">By stage </);
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
  assert.ok(chips('svc').includes('Model checks') && chips('records').includes('Data checks') && chips('dca').includes('DC timing'));
  const W = require('../js/workspaces.js');
  assert.equal(W.tabPath('svc', 'checks'), 'Servicing › Model checks');
  assert.equal(W.tabPath('records', 'checks'), 'Records › Data checks');
  assert.equal(W.tabPath('growth', 'timing'), 'Growth › Forecast');
  assert.equal(W.tabPath('dca', 'timing'), 'Capital › DC timing');
  assert.ok(W.WS.some(w => w.id === 'projects' && w.label === 'DC projects'));
  for (const [f, re] of [['js/timing.js', /areaHead\('Growth › Forecast'/], ['js/dca-tab.js', /areaHead\('Capital › DC timing'/], ['js/svc-capacity.js', /areaHead\('Servicing › Model checks'/], ['js/records-tab.js', /areaHead\('Records › Data checks'/]]) assert.match(src(f), re, f);
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
  for (const old of ['DC needs:', 'Development tab', 'Layers & style', 'Data tab:', 'DC map view', 'This week tab', 'Definitions (Overview', 'Inception', 'Under review', 'Draft / site plan approved']) assert.ok(!HELP.includes(old), `Help still says "${old}"`);
});
