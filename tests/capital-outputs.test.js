'use strict';
// Capital and EA outputs for the people who use them: the reviewer's site brief, the planner's
// watch list (Capital › Construction › To check) and the CSV with one row per contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../js/capital-ea-model.js');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const TODAY = '2026-10-21';
const line = (x, y) => ({ type: 'LineString', coordinates: [[x, y], [x + 0.002, y]] });
const rec = o => ({ id: o.id, projectNumber: o.pn || o.id, contract: o.contract || `c:${o.id}`, workType: 'WM', street: 'MAIN ST', ward: 'B01', municipality: '', system: 'water', lengthM: 100, geometry: line(-79.76, 43.686), ...o });
const ea = o => ({ id: o.id, name: o.name || o.id, system: 'water', status: 'consultation', municipality: 'Brampton', milestones: [], links: { page: `https://peelregion.ca/ea/${o.id}` }, related: { capitalProjects: [] }, geomType: 'area', geomMethod: 'traced', geomConfidence: 'medium', geometry: { type: 'Point', coordinates: [-79.76, 43.686] }, ...o });

test('contract checks: past the target, not updated in a year, % built reported or estimated', () => {
  const cs = M.contracts([
    rec({ id: 'late', status: 'under construction', startActual: '2025-01-01', substantialTarget: '2026-06-30', lastUpdate: '2026-03-01' }),
    rec({ id: 'mid', status: 'under construction', startActual: '2026-01-01', substantialTarget: '2027-01-01', lastUpdate: '2026-03-01' }),
    rec({ id: 'old', status: 'planned', substantialTarget: '2029-01-01', lastUpdate: '2024-01-01' }),
    rec({ id: 'done', status: 'complete', substantialTarget: '2025-01-01', lastUpdate: '2020-01-01' }),
    rec({ id: 'pct', status: 'under construction', percentComplete: 40, startActual: '2026-01-01', substantialTarget: '2027-01-01', lastUpdate: '2026-03-01' }),
  ]);
  const k = id => M.contractCheck(cs.get(`c:${id}`), TODAY, '2026-04-13');
  assert.equal(k('late').overdue.days, 113);
  assert.equal(k('late').progress, null, 'no date estimate once the target has passed');
  assert.deepEqual(k('mid').progress, { pct: 80, basis: 'estimated from dates' });
  assert.deepEqual(k('pct').progress, { pct: 40, basis: 'reported' });
  assert.equal(k('mid').overdue, null);
  assert.ok(k('old').stale, 'open work not updated in the year before the layer’s latest update');
  assert.equal(k('mid').stale, null);
  assert.equal(k('done').stale, null, 'complete work is not stale');
  assert.equal(k('done').overdue, null, 'complete work is not late');
  assert.equal(M.placeOf({ ward: 'M04', municipality: 'MISSISSAUGA/BRAMPTON/CALEDON' }), 'Mississauga');
  assert.equal(M.placeOf({ ward: '', municipality: 'CALEDON' }), 'Caledon');
});

test('EA check: current with nothing ahead and no milestone in 18 months', () => {
  assert.deepEqual(M.eaCheck(ea({ id: 'a', milestones: [{ type: 'pic', date: '2021-12-02' }] }), TODAY), { last: '2021-12-02', days: 1784 });
  assert.equal(M.eaCheck(ea({ id: 'b', milestones: [{ type: 'pic', date: '2021-12-02' }, { type: 'report', date: '2026-11' }] }), TODAY), null, 'something dated ahead');
  assert.equal(M.eaCheck(ea({ id: 'c', milestones: [{ type: 'pic', date: '2026-03-10' }] }), TODAY), null, 'recent');
  assert.deepEqual(M.eaCheck(ea({ id: 'd' }), TODAY), { last: null, days: null }, 'no dated milestone at all');
  assert.equal(M.eaCheck(ea({ id: 'e', status: 'complete' }), TODAY), null);
});

test('watch list: worst first, each with why and what to check; municipality scope; CSV rows', () => {
  const records = [
    rec({ id: 'late', status: 'under construction', substantialTarget: '2025-06-30', lastUpdate: '2026-03-01' }),
    rec({ id: 'later', status: 'awarded', substantialTarget: '2023-06-30', lastUpdate: '2026-03-01' }),
    rec({ id: 'old', status: 'planned', lastUpdate: '2023-01-01', ward: 'M02' }),
    rec({ id: 'fine', status: 'under construction', substantialTarget: '2027-06-30', lastUpdate: '2026-03-01' }),
  ];
  const capital = { source: { latestLastUpdate: '2026-04-13' }, records };
  const eas = [ea({ id: 'idle', milestones: [{ type: 'pic', date: '2020-05-01' }] }), ea({ id: 'waiting', status: 'complete', completedYear: 2012, milestones: [] }), ea({ id: 'busy', milestones: [{ type: 'report', date: '2026-12-01' }] })];
  const w = M.watchList({ capital, eas, today: TODAY });
  assert.deepEqual(w.map(x => `${x.kind}:${x.key}`), ['review:ea:waiting', 'overdue:cap:c:later', 'overdue:cap:c:late', 'dormant:ea:idle', 'stale:cap:c:old']);
  for (const x of w) { assert.ok(x.why && x.check, 'every item says why and what to check'); assert.doesNotMatch(`${x.why} ${x.check}`, /\bshould\b|recommend/i, 'screening wording'); }
  assert.match(w[1].why, /completion target \(Jun 30, 2023\) passed 3 years ago/);
  assert.deepEqual(M.watchList({ capital, eas, today: TODAY, muni: 'Mississauga' }).map(x => x.key), ['cap:c:old']);
  const html = M.watchListHTML(w);
  assert.match(html, /data-ce-open="ea:waiting"/); assert.match(html, /data-ce-watch-csv/); assert.match(html, /To check: /);
  assert.match(M.watchListHTML([]), /Nothing to check/);
  const sh = M.watchSheetRows(w, '2026-04-13');
  assert.equal(sh.cols.length, sh.rows[0].length); assert.equal(sh.rows.length, w.length);
  assert.equal(sh.rows[0][0], 'EA complete 9+ years, no construction');
});

test('site brief: EAs and open works within 1 km, nearest first, as lines and paste-ready text', () => {
  const records = [
    rec({ id: 'on', status: 'under construction', startActual: '2026-01-01', substantialTarget: '2027-01-01', website: 'https://peelregion.ca/construction/on' }),
    rec({ id: 'near', status: 'planned', substantialTarget: '2030-06-01', geometry: line(-79.76, 43.692), lastUpdate: '2026-03-01' }),
    rec({ id: 'far', status: 'planned', geometry: line(-79.70, 43.70) }),
    rec({ id: 'built', status: 'complete' }),
  ];
  const cs = M.contracts(records);
  const list = [ea({ id: 'here', name: 'Main St watermain', schedule: 'B', nextStep: { text: 'Report released', date: '2026-11' } }), ea({ id: 'done', name: 'Old study', status: 'complete', completedYear: 2019, decision: { text: 'Twin the main.' }, geometry: { type: 'Point', coordinates: [-79.76, 43.690] } }), ea({ id: 'away', geometry: { type: 'Point', coordinates: [-79.6, 43.6] } }), ea({ id: 'wide', municipality: 'Region-wide', geometry: null, geomMethod: 'none' })];
  const b = M.siteBrief({ eas: list, contracts: cs, lat: 43.686, lng: -79.759, pts: [], muni: 'Brampton', today: TODAY, asOf: '2026-04-13' });
  assert.deepEqual(b.eas.map(x => x.e.id), ['here', 'done']);
  assert.deepEqual(b.may.map(e => e.id), ['wide']);
  assert.deepEqual(b.works.map(x => x.c.key), ['c:on', 'c:near'], 'complete and far work left out');
  const [head, tail] = M.briefWorkLine(b.works[0]);
  assert.equal(head, 'Watermain · Main St (project on)');
  assert.match(tail, /^Under construction, \d+% built \(estimated from its dates\); in service 2027 \(target\), on the site/);
  assert.match(M.briefEaLine(b.eas[1]).join(': '), /^Old study: Complete \(Water\), \d+ m away; completed 2019\. Preferred solution \(from the report; check it\): "Twin the main\."$/);
  const t = M.siteBriefText(b, { title: '10 Main St', asOf: '2026-04-13', easChecked: '2026-10-19' });
  assert.match(t, /^Region EAs and capital works within 1 km of 10 Main St/);
  assert.match(t, /Environmental assessments \(2\):\n- Main St watermain: Consultation \(Water, Schedule B\), 80 m away; next: Report released Nov 2026\. https:\/\/peelregion\.ca\/ea\/here/);
  assert.match(t, /check it\): "Twin the main\." https:\/\/peelregion\.ca\/ea\/done/, 'one full stop after a quoted sentence');
  assert.match(t, /May also apply \(not mapped; 1\)/);
  assert.match(t, /https:\/\/peelregion\.ca\/construction\/on/);
  assert.match(t, /capital projects layer, as of Apr 13, 2026\. General screening results only\.$/);
  const h = M.siteBriefHTML(b);
  assert.match(h, /data-ce-open="ea:here"/); assert.match(h, /data-ce-open="cap:c:on"/);
  assert.doesNotMatch(M.siteBriefHTML(b, { links: false }), /data-ce-open/, 'the memo has no app buttons');
  const empty = M.siteBrief({ eas: [], contracts: new Map(), lat: 43.686, lng: -79.759, today: TODAY });
  assert.match(M.siteBriefText(empty), /None mapped within this distance[\s\S]*None in the capital projects layer/);
});

test('contract CSV: one row per contract, flagged first, with the EA and DC link and how sure each is', () => {
  const records = [
    rec({ id: 'r1', status: 'planned', contract: 'web:a', lastUpdate: '2026-03-01' }),
    rec({ id: 'r2', status: 'under construction', contract: 'web:b', substantialTarget: '2025-01-01', lastUpdate: '2026-03-01', ward: 'C02' }),
  ];
  const cs = M.contracts(records);
  const eas = [ea({ id: 'x', name: 'The EA', related: { capitalProjects: [{ id: 'r1', projectNumber: 'r1', method: 'project website' }] } })];
  const links = [{ dc: 'water:line:c123', capital: 'r1', method: 'project', confidence: 'medium' }];
  const sh = M.capitalSheetRows(cs, { today: TODAY, asOf: '2026-04-13', eas, links });
  const col = (row, name) => row[sh.cols.indexOf(name)];
  assert.equal(sh.rows.length, 2); assert.equal(sh.cols.length, sh.rows[0].length);
  assert.equal(col(sh.rows[0], 'Project number(s)'), 'r2', 'the late one first');
  assert.equal(col(sh.rows[0], 'Days past completion target'), 658);
  assert.equal(col(sh.rows[0], 'Located in'), 'Caledon');
  assert.match(col(sh.rows[0], 'To check'), /completion target passed/);
  assert.equal(col(sh.rows[1], 'From an EA'), 'The EA'); assert.equal(col(sh.rows[1], 'EA link method'), 'project website');
  assert.equal(col(sh.rows[1], 'DC program link'), 'Water DC line component 123'); assert.equal(col(sh.rows[1], 'DC link confidence'), 'medium');
  assert.equal(col(sh.rows[1], 'Data as of'), '2026-04-13');
  assert.equal(M.capitalSheetRows(cs, { today: TODAY, muni: 'Caledon' }).rows.length, 1, 'municipality scope');
});

test('wiring: Construction › To check and its CSVs, the site panel and its copy action, the memo, the workbook', () => {
  const ce = src('js/capital-ea.js');
  assert.match(ce, /watch: watchList\(\), allWatch/);
  assert.match(ce, /\[data-ce-watch-csv\]'\)\) csv\('peel-capital-to-check'/);
  assert.match(ce, /\[data-ce-cap-csv\]'\)\) csv\('peel-capital-contracts', capitalRows\(muni\(\)\)\)/);
  assert.match(ce, /label: 'Copy for review comments', attrs: \{ 'data-ce-copy-brief': '' \}/);
  assert.match(ce, /\['Capital to check', M\.watchSheetRows/);
  assert.match(src('js/reports.js'), /PeelCapitalEA\.siteBriefHTML\(p, \{ links: false \}\)/);
  // (navigation phase 5: EAs are no chip at a site, so EMPTY_AT_SITE went; the site's Capital panel lists
  // the EAs and works near it only when there are some)
  assert.match(src('js/dca-tab.js'), /siteBriefCount\(\) > 0/);
  assert.doesNotMatch(src('js/analysis-tabs.js'), /EMPTY_AT_SITE/);
  const html = M.listsHTML({ contracts: new Map(), hasCapital: true, watch: [] });
  assert.match(html, /data-sec="watch"[\s\S]*Nothing to check[\s\S]*data-ce-cap-csv/);
});

test('real data: the brief, the list and the CSV build from the committed files', () => {
  const capital = JSON.parse(src('data/capital.json')), easData = JSON.parse(src('data/eas.json'));
  const cs = M.contracts(capital.records);
  const w = M.watchList({ capital, eas: easData.eas, contracts: cs, today: TODAY });
  assert.ok(w.length > 0);
  const sh = M.capitalSheetRows(cs, { today: TODAY, asOf: capital.source.latestLastUpdate, eas: easData.eas, links: capital.links });
  assert.equal(sh.rows.length, cs.size);
  assert.ok(sh.rows.every(r => r.length === sh.cols.length));
  const people = /ProjectManager|Inspector|Contractor|ContractAdmin|Consultant|AssignmentID/i;
  assert.doesNotMatch(JSON.stringify(sh) + JSON.stringify(w), people);
  const b = M.siteBrief({ eas: easData.eas, contracts: cs, lat: 43.6857, lng: -79.7599, pts: [], muni: 'Brampton', today: TODAY, asOf: capital.source.latestLastUpdate });
  assert.ok(b.eas.length > 0 && b.works.length > 0, 'downtown Brampton has EAs and works nearby');
});
