'use strict';
// How it works (js/reference.js): the reference guides as pages in Home's layout, their figures from
// the app's own data and rules, reached from the sidebar, Help and each workspace's footer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const json = f => JSON.parse(src(f));
const R = require('../js/reference.js');
const D = require('../js/demand.js');

const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const NOTE = /General screening|confirm the current rules and figures with the Region of Peel/;

test('nine guides in reading order, How approvals work among them; How it works lists them all', () => {
  assert.deepEqual(R.IDS, ['roles', 'approvals', 'flows', 'network', 'capacity', 'fsrguide', 'capital', 'targets', 'forecast']);
  const ix = R.indexPage();
  assert.equal(ix.id, 'guides');
  for (const [id, label] of R.GUIDES) assert.ok(ix.mid.includes(`data-ws-page="${id}"`) && ix.mid.includes(label), id);
  assert.match(ix.mid, /data-ws-page="glossary"/);
});

test('each guide: the question as its title, n of 9, previous / All guides / next, and the screening note in its method', () => {
  const pages = { roles: R.roles(), flows: R.flows(null), network: R.network(json('data/peel-reports.json')), capacity: R.capacity(null), fsrguide: R.fsrguide([]), capital: R.capital([], []), targets: R.targets(json('data/housing.json'), json('data/peel-reports.json').forecast2051, null), forecast: R.forecast({}) };
  for (const [id, m] of Object.entries(pages)) {
    const g = R.GUIDES.find(x => x[0] === id), i = R.IDS.indexOf(id);
    assert.equal(m.id, id); assert.equal(m.name, g[2]);
    assert.match(m.eyebrow, new RegExp(`${i + 1} of 9`), id);
    assert.match(m.mid, /class="rf-nav"/, id);
    if (i > 0) assert.ok(m.mid.includes(`data-ws-page="${R.IDS[i - 1]}"`), `${id}: previous`);
    if (i < 8) assert.ok(m.mid.includes(`data-ws-page="${R.IDS[i + 1]}"`), `${id}: next`);
    assert.ok(m.actions.some(a => a.attrs['data-ws-page'] === 'guides'), `${id}: All guides`);
    if (m.method) assert.match(m.method, NOTE, id);
    assert.doesNotMatch(strip(m.answer + m.mid), /\bthe Region (approves|has approved|decided)\b/, `${id}: screening wording`);
  }
});

test('Who decides what: the Region of Peel has made no planning approvals since July 1, 2024; the cities approve', () => {
  const m = R.roles(), t = strip(m.mid + m.answer);
  assert.match(t, /Since July 1, 2024 it makes no planning approvals/);
  for (const w of ['Province of Ontario', 'Ontario Land Tribunal', 'Region of Peel', 'Brampton, Mississauga and Caledon', 'Conservation authorities']) assert.ok(t.includes(w), w);
  assert.match(t, /Credit Valley \(CVC\), Toronto and Region \(TRCA\) and Nottawasaga Valley \(NVCA\)/);
});

test('From homes to flows: 0 Heritage Rd worked through the app’s own estimate (the high-density rate, Harmon, I&I)', () => {
  const p = { key: 'x', units: R.EXAMPLE.units.apartment, phase: 'review', types: ['apartment'], description: '', siteAreaHa: R.EXAMPLE.ha, buildout: null };
  const e = D.estimate([p], D.DEFAULT_CRITERIA);
  const x = { title: '0 HERITAGE RD', muni: 'Brampton', e, crit: D.DEFAULT_CRITERIA, ha: R.EXAMPLE.ha, plant: { name: 'G.E. Booth', rated: 518 } };
  const steps = R.flowSteps(x), t = steps.map(s => strip(s.join(' '))).join('\n');
  assert.equal(Math.round(e.population), 13894, '5,146 apartments × 2.7 (denser than 475 people per hectare)');
  assert.match(t, /5,146 apartments × 2\.70 people = 13,894/);
  assert.match(t, /above 475: Peel’s standard then uses 2\.70/);
  assert.match(t, /1 \+ 14 ÷ \(4 \+ √\(13,894 ÷ 1,000\)\) = 2\.81/);
  assert.match(t, /0\.26 L\/s per hectare × 8\.14 ha = 2\.1 L\/s/);
  assert.match(t, /133\.2 L\/s/, 'peak wet weather');
  assert.match(t, /78\.2 and 130\.3 L\/s/, 'maximum day and peak hour');
  assert.match(t, /0\.78% of rated/, 'its share of G.E. Booth');
  // The page's figures are the estimate's.
  const m = R.flows(x);
  assert.deepEqual(m.figures.map(f => f.v), ['13,894', '78.2', '131.1', '133.2']);
  // A live development opens Check a site with it.
  assert.deepEqual(R.flows({ ...x, key: 'Brampton|k' }).actions[0].attrs, { 'data-ws-pick': 'Brampton|k', 'data-ws-as': 'site' });
});

test('How sewage and water travel: the plants and the water systems from the 2025 reports', () => {
  const rep = json('data/peel-reports.json'), m = R.network(rep), t = strip(m.mid);
  assert.match(t, /G\.E\. Booth WRRF \(Lakeview\)[^.]*east trunk system/i);
  assert.match(t, /Rated 518 ML\/d; 2025 average 427\.8 ML\/d \(83%\)/);
  assert.match(t, /Clarkson WRRF The west trunk system/);
  assert.match(t, /Arthur P\. Kennedy WTP/); assert.match(t, /Lorne Park WTP/);
  assert.match(t, /Palgrave – Caledon East/);
  assert.match(t, /Part of Malton drains to Toronto/);
  assert.deepEqual(m.figures.filter(Boolean).map(f => f.v), ['83%', '61%', '70', '1,585,000']);
});

test('How capacity is checked: the stack (existing + built + committed + in review) and the Master Plan’s tests', () => {
  const m = R.capacity(null), t = strip(m.mid);
  assert.deepEqual(R.LAYERS.map(l => l[0]), ['existing', 'built', 'committed', 'proposed']);
  assert.match(t, /Wastewater treatment plant Annual average flow Rated capacity The 90% expansion trigger/);
  assert.match(t, /Sewage pumping station Peak wet-weather flow Firm capacity/);
  assert.match(t, /Sewers and watermains[^]*Not in the app: the Region’s model/);
  assert.match(t, /Room under 90% · Tight 90–100% · Over 100% or more/);
  // The same thresholds the panels colour by.
  const PN = src('js/panel.js');
  assert.match(PN, /pct >= 100 \? 'over' : pct >= 90 \? 'tight' : 'room'/);
});

test('What an FSR should cover: the sections, and Review an FSR’s own coverage list', () => {
  const cov = [['Fire flow', 'eye', 'Not modelled here']], m = R.fsrguide(cov), t = strip(m.mid);
  assert.match(t, /Fire flow By an engineer Not modelled here/);
  for (const [s] of R.FSR_PARTS) assert.ok(t.includes(s), s);
  assert.match(m.method, /Functional Servicing Report Requirements \(November 2009\)/);
});

test('How a capital project gets built: the steps against the app’s status words, the EA schedules counted from the data', () => {
  const eas = json('data/eas.json').eas, cap = json('data/capital.json').records, m = R.capital(eas, cap), t = strip(m.mid);
  assert.deepEqual(R.CAP_STEPS.map(s => s[0]), ['Master Plan', 'DC Background Study', 'Class EA', 'Design and approvals', 'Tender and award', 'Construction', 'In service']);
  const n = k => eas.filter(e => e.schedule === k).length;
  assert.ok(t.includes(`Full: phases 1–4 (problem, options, design concepts, an Environmental Study Report), with a 30-day review. ${n('C')}`), 'schedule C counted');
  assert.match(t, /Capital: under construction/);
  assert.equal(m.figures[2].v, cap.filter(r => r.status === 'under construction').length.toLocaleString('en-CA'));
});

test('Growth targets and forecasts: the 2031 targets and progress, the 2051 allocation, the projection, the pipeline', () => {
  const H = json('data/housing.json'), F = json('data/peel-reports.json').forecast2051;
  const rows = R.targetRows(H, F, { Brampton: 1000, Mississauga: 2000, Caledon: 3000 });
  const b = rows.find(r => r.muni === 'Brampton');
  assert.equal(b.target, 113000); assert.equal(b.since, 21005); assert.equal(b.need2051, 292000 - 186000); assert.equal(b.pipe, 1000);
  const m = R.targets(H, F, { Brampton: 1000, Mississauga: 2000, Caledon: 3000 }), t = strip(m.mid);
  assert.match(t, /The Region plans for 2,280,000 people by 2051/);
  assert.match(t, /Ministry of Finance’s 2026 projection has 1,895,000/);
  assert.match(t, /1,000 in the pipeline/);
});

test('wired in: the sidebar shows Help, How it works and the Glossary; every guide opens as a page; the workspaces link their guide', () => {
  const w = src('js/workspaces.js'), s = src('js/ws-pages.js');
  assert.match(w, /guides: \{ label: 'How it works'/);
  for (const id of R.IDS) assert.ok(new RegExp(`\\['${id}', '[^']+'\\]`).test(w), `${id} in REF`);
  assert.match(w, /const isOn = id => page === id \|\| \(id === 'guides' && !!\(REF\[page\] && REF\[page\]\.guide\)\) \|\| \(id === 'explore' && EXPLORE\.includes\(page\)\) \|\| \(id === 'capital' && CAPITAL\.includes\(page\)\) \|\| \(id === 'reference' && !!REF\[page\]\);/, 'a guide lights How it works; an Explore view lights Explore');
  assert.match(s, /const ref = id => \(\) => \(root\.PeelReference \? root\.PeelReference\.page\(id\)/);
  assert.match(s, /const GUIDE_OF = \{ site: 'flows', tight: 'capacity', growth: 'targets', fsr: 'fsrguide', projects: 'capital', eaflow: 'capital', pipes: 'network' \};/);
  assert.match(src('js/tips.js'), /data-ws-page="guides">How it works: the guides<\/button>/);
  assert.match(src('index.html'), /<script src="js\/reference\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/reference\.js',/);
  assert.match(src('css/app.css'), /\/\* How it works: the reference guides \(js\/reference\.js\) \*\//);
});

test('How the forecast is timed: the three steps, the homes needed, the completions record and the CMHC tables, from the data', () => {
  const T = require('../js/timing.js');
  const F = json('data/peel-reports.json').forecast2051.municipalities, H = json('data/housing.json');
  const homes = T.homesNeeded(H.mof.peel, F);
  const activity = json('data/peel-housing.json').activity.muni;
  const fc = { by2031: 27197, by2041: 67491, low2031: 22401, high2031: 31787, after: 25500, endYear: 2052, perYear: [[2026, 1277], [2027, 5205], [2028, 5725], [2029, 5465]] };
  const times = [{ stage: 'permit', size: 'S', n: 8349, median: 19, left5: 0.34 }, { stage: 'inception', size: 'L', n: 335, median: null, left5: 0.81 }];
  const m = R.forecast({ homes, F, activity, times, fc, oldThisYear: 66381 });
  const t = strip(m.answer + m.mid);
  assert.equal(m.name, 'When will the pipeline be built?');
  for (const k of ['steps', 'why', 'stage', 'beyond', 'build', 'chart', 'record', 'cmhc', 'limits']) assert.match(m.mid, new RegExp(`data-psec="${k}"`), k);
  assert.match(t, /For every development in Peel's pipeline that is about 27,000 homes built by 2031 and 67,000 by 2041/);
  assert.match(t, /about 66,000 homes in 2026/, 'the old method, said');
  assert.match(t, /÷ 2\.58 people per new home/);
  assert.match(t, /Mississauga 36%/);
  assert.match(t, /Under construction always finishes/);
  assert.match(t, /250 units a year/);
  assert.match(t, /19 months/); assert.match(t, /more than half not finished yet/);
  assert.match(t, /Mississauga 2022: 11,743 instead of 1,161/);
  assert.match(t, /every year but 2018/);
  assert.match(t, /not a prediction for any one site/);
  // The record: Peel's completions by year, and its average.
  const rec = R.completionsRecord(activity);
  assert.equal(rec.rows[0].year, 2016);
  assert.equal(rec.rows.find(r => r.year === 2022).peel, 1161 + 2251 + 640);
  assert.ok(rec.avg > 4000 && rec.avg < 6000, `average ${rec.avg}`);
  // The homes-needed table: none in a falling year.
  assert.match(m.mid, /<th scope="row">2027<\/th><td>0<\/td>/);
  assert.match(m.method, NOTE);
  // Linked from the Forecast panel and How it works.
  assert.match(src('js/timing.js'), /\{ label: 'How the forecast is timed', attrs: \{ 'data-ws-page': 'forecast' \} \}/);
  assert.match(src('js/workspaces.js'), /\['forecast', 'How the forecast is timed'\]\]\) REF\[id\]/);
});
