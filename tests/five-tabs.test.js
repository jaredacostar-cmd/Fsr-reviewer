'use strict';
// SPEC §5 (Phase 4): the right panel has the same five tabs at every scope — Overview · Growth ·
// Servicing · Capital · Records. Servicing holds the wastewater and water views; Records follows the
// scope; no placeholder sub-views at site scope; one disclaimer per panel; one "Largest" list; empty
// plans behind "show empty"; the approval-pace column only with data; site tiles follow the type.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = src('index.html');

test('five tabs, in order; Servicing holds the wastewater and water views in one sub-view row', () => {
  const tabs = [...HTML.matchAll(/class="f-tab" id="ftab-(\w+)"[^>]*>([^<]+)</g)].map(m => m[2]);
  assert.deepEqual(tabs, ['Overview', 'Growth', 'Servicing', 'Capital', 'Records']);
  const row = HTML.slice(HTML.indexOf('<div class="f-pane f-subtabs svc-subtabs" data-pane="svc"'), HTML.indexOf('</div>', HTML.indexOf('svc-subtabs')));
  for (const s of ['data-wwsub="plants"', 'data-wwsub="catchments"', 'data-wwsub="alloc"', 'data-wwsub="pumpstations"', 'data-wsub="capacity"', 'data-wsub="zones"', 'data-wsub="facilities"', 'data-wsub="hydro"']) assert.ok(row.includes(s), s);
  const at = src('js/analysis-tabs.js');
  assert.match(at, /const tabOf = key => \(SVC\.has\(key\) \? 'svc' : key\);/);
  assert.match(at, /if \(pk === 'svc'\) \{ p\.hidden = !SVC\.has\(key\); continue; \}/);
  assert.match(at, /if \(key === 'dev' \|\| key === 'developments' \|\| key === 'tool'\) key = 'overview';/);
  assert.match(src('js/svc-tab.js'), /\$\('#ftab-svc'\)\.hidden = !has;/);
});

test('Records follows the scope: Peel sources / checks / duplicates; a development its files; a file the file', () => {
  const r = src('js/records-tab.js');
  assert.match(r, /return `\$\{DU\(\)\.freshnessHTML\(\)\}\$\{dups\}/);
  assert.match(r, /possible duplicate pair/);
  assert.match(r, /if \(scoped\) \{ syncDevHome\('records'\); return; \}/);
  assert.match(r, /if \(DT && DT\.setSub\) DT\.setSub\('files'\);/);
  assert.match(r, /s\.rkind === 'file' && AC\(\)\.currentFile/);
  assert.match(HTML, /<section class="f-pane" id="pane-records" data-pane="records"[^>]*><div id="records-body"><\/div><\/section>/);
  assert.match(src('css/app.css'), /#pane-overview \.dev-subtabs \[data-devsub="files"\]/, 'Files & history lives in Records');
});

test('no placeholder sub-views at site scope; one disclaimer per panel', () => {
  const at = src('js/analysis-tabs.js');
  assert.match(at, /const SITE_HIDDEN = \{ growth: \['census2051', 'timing'\], dca: \['recommendations', 'funding'\] \};/);
  assert.match(at, /if \(site && SITE_HIDDEN\.growth\.includes\(gSub\)\) gSub = 'pipeline';/);
  const css = src('css/app.css');
  for (const s of ['#analysis.site-scope [data-gsub="census2051"]', '#analysis.site-scope [data-gsub="timing"]', '#analysis.site-scope [data-dcasub="recommendations"]', '#analysis.site-scope [data-dcasub="funding"]', '#analysis.site-scope #screen-note-top']) assert.ok(css.includes(s), s);
});

test('one "Largest" list (Overview, by units left to build); no Developments tab', () => {
  assert.doesNotMatch(src('js/growth-ui.js'), /Largest pipelines still to build/);
  assert.match(src('js/overview-tab.js'), /<h3>Largest unbuilt<\/h3>/);
  assert.match(src('js/overview-tab.js'), /\.sort\(\(a, b\) => left\(b\) - left\(a\)\)/);
  assert.doesNotMatch(src('js/developments-tab.js'), /ftab-developments/);
});

test('By plan: empty plans behind "show empty"; Growth: the approval-pace column only with data', () => {
  const pt = src('js/plan-tables.js');
  assert.match(pt, /const isEmpty = n => n\.kind !== 'peel' && n\.kind !== 'municipality' && !\(n\.m\.planned >= 0\.5\);/);
  assert.match(pt, /for \(const c of n\.children\) if \(showEmpty \|\| !isEmpty\(c\)\) bodyRows\(c, depth \+ 1, out\);/);
  assert.match(pt, /data-pt-empty/);
  assert.match(src('js/growth-ui.js'), /const pace = lags\.length > 0 && allMedian != null;/);
});

test('site templates by type: residential units·people·ppu; mixed units·people·jobs·GFA; employment jobs·GFA·site area', () => {
  const o = src('js/overview-tab.js');
  const m = o.match(/function siteKind\(p, pe, em\) \{[\s\S]*?\n  \}/); assert.ok(m);
  const siteKind = new Function(`${m[0]}; return siteKind;`)();
  assert.equal(siteKind({}, { totalUnits: 100 }, null), 'residential');
  assert.equal(siteKind({}, { totalUnits: 100 }, { totalM2: 5000, jobs: 50 }), 'mixed');
  assert.equal(siteKind({}, { totalUnits: 0 }, { totalM2: 5000, jobs: 50 }), 'employment');
  assert.match(o, /kind === 'employment' \? \[jobsT, gfaT, p\.siteAreaHa > 0 \? tile\(fmt1\(p\.siteAreaHa\), 'ha', 'site area'\) : ''\]/);
  assert.match(o, /: kind === 'mixed' \? \[unitsT, pplT, jobsT, gfaT\]/);
  assert.match(o, /'ppu', 'people per unit'/);
});

test('a development\'s Overview opens with "n things to confirm", computed per site', () => {
  const o = src('js/overview-tab.js');
  assert.match(o, /function thingsToConfirm\(p, \{ st, f, cb, kind \}\)/);
  for (const what of ['Counts as', 'Outside the mapped', 'Waits on a planned DC main', 'Pipe-by-pipe capacity is not assessed', 'Under appeal', 'I&amp;I on an estimated site area', 'are estimated']) assert.ok(o.includes(what), what);
  assert.match(o, /thing\$\{confirm\.length === 1 \? '' : 's'\} to confirm/);
});

test('Peel Overview: tiles with layer sub-labels; Needs attention grouped and counted', () => {
  const o = src('js/overview-tab.js');
  assert.match(o, /tile\(fmtNum\(Math\.round\(unitsAll\)\), 'units', 'planned', \[lyTiles\.units,/);
  assert.match(o, /tile\(fmtNum\(roundPop\(e\.population\)\), 'people', 'at build-out', lyTiles\.people\)/);
  const dv = src('js/dev-verdict.js');
  const na = new Function(`${dv.match(/const needsAttention = \(d\) => \{[\s\S]*?\n  \};/)[0]}\n${dv.match(/const needsGroups = \(d\) => \{[\s\S]*?\n  \};/)[0]}\nreturn needsGroups;`)();
  const g = na({ adv: [{ name: 'X' }], trig: [{ sys: 'ww', now: false, text: 'G.E. Booth ≈2028' }], stalled: [{ key: 'a', title: 'A', muni: 'B', units: 300, unitsTxt: '300', years: '3.0 yrs' }, { key: 'b', title: 'B', muni: 'B', units: 10, unitsTxt: '10', years: '2.1 yrs' }], changes: [{ key: 'c', text: 'New: C' }] });
  assert.deepEqual(g.map(x => [x.name, x.count, x.items.length]), [['Capacity', 2, 2], ['Stalled', 2, 1], ['This week', 1, 1]]);
  // Capital / EA items are shown too: DC dates moving later under Capacity, EA periods closing under This week.
  const g2 = na({ ce: [{ ce: 'ea:x', text: 'EA comment period closes Oct 30: X' }, { ce: 'cap:k', text: 'DC project 1: capital dates moved 3 months later' }] });
  assert.deepEqual(g2.map(x => [x.name, x.count, x.items.map(i => i.ce)]), [['Capacity', 1, ['cap:k']], ['Stalled', 0, []], ['This week', 1, ['ea:x']]]);
});

test('Overview "would add": units and people completed before census day (Existing) are left out, and listed in the tile parts', () => {
  const du = src('js/demand-ui.js');
  const preCensus = new Function(`${du.match(/const preCensus = [^\n]+/)[0]}\nreturn preCensus;`)();
  const t = { units: { existing: 2390, built: 22663 }, people: { existing: 7700, built: 65800 } };
  assert.deepEqual(preCensus(t, 'all'), { units: 2390, people: 7700 });
  assert.deepEqual(preCensus(t, 'committed'), { units: 2390, people: 7700 });
  assert.deepEqual(preCensus(t, 'remaining'), { units: 0, people: 0 }, 'the remaining basis counts no completed units');
  assert.deepEqual(preCensus(null, 'all'), { units: 0, people: 0 });
  const o = src('js/overview-tab.js');
  assert.match(o, /const pre = DU\(\)\.preCensus\(lyT, basis\);/);
  assert.match(o, /e\.population - pre\.people/);
  assert.match(o, /unitsAll - pre\.units/);
  assert.match(o, /\['existing', 'built', 'committed', 'proposed', 'anticipated'\]/, 'the tile parts include Existing, so they add up');
  assert.match(src('js/reports.js'), /e\.population - pre\.people/, 'the briefing says the same');
});
