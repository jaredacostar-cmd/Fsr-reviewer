'use strict';
// Navigation phase 1 — Find from every page (docs/architecture-review/navigation-design.md §3.3): each
// search hit says what it is (js/search-filter.js), and a pick on a page opens what it found
// (js/workspaces.js pageRoute / routePick, js/ws-pages.js siteAt / drillTo / sectionAt). On the full
// map and in a workspace's map view the search works as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
const W = require('../js/workspaces.js');
const sf = src('js/search-filter.js');
const body = (s, head) => { const i = s.indexOf(head); assert.ok(i >= 0, head); return s.slice(i, s.indexOf('\n  }\n', i)); };

test('a development found by a file number only says so (the number it matched)', () => {
  const line = sf.match(/ {2}const fileRefOf = [^\n]*/)[0];
  const fileRefOf = new Function(`${line} return fileRefOf;`)();
  const p = { title: 'Mayfield Towers', records: [{ ref: 'OZ-21-005', address: '10 Main St' }, { ref: 'SPA 22 104', address: '' }] };
  assert.equal(fileRefOf(p, 'oz-21'), 'OZ-21-005', 'a file-number prefix: its ref');
  assert.equal(fileRefOf(p, 'spa 22 1'), 'SPA 22 104');
  // A title or an address match is a match on the place, not the file.
  assert.equal(fileRefOf({ title: 'Lot 21-005 Towers', records: [{ ref: '21-005-X', address: '' }] }, '21-005'), null, 'in the title');
  assert.equal(fileRefOf({ title: 'x', records: [{ ref: '1234 HURON', address: '1234 Huron Rd' }] }, '1234 h'), null, 'in an address');
  // (as the search: 5 characters with a digit)
  assert.equal(fileRefOf(p, 'oz-2'), null, 'fewer than 5 characters');
  assert.equal(fileRefOf({ title: 'x', records: [{ ref: 'OZABCD', address: '' }] }, 'ozabc'), null, 'no digit');
  assert.equal(fileRefOf(p, 'zz-99'), null, 'no file starts with it');
  // The suggestion carries it; the row looks as before (devLine shows the hit file number).
  assert.match(sf, /const devItems = devs\.map\(p => \{ const ref = fileRefOf\(p, ql\); return \{ label: p\.title, p, \.\.\.\(ref \? \{ hit: 'file', ref \} : \{\}\) \}; \}\);/);
  assert.equal((sf.match(/\.\.\.devItems, \.\.\.places/g) || []).length, 2, 'the same items before and after the address lookup');
});

test('every place hit carries what it is, for the page to open it', () => {
  assert.match(sf, /const area = \(kind, a, go, route\) => out\.push\(\{ label: a\.name, place: \{ kind, go, \.\.\.route \} \}\);/);
  assert.match(sf, /\{ hit: 'plan', id: a\.id, muni: a\.municipality \}\);/);
  assert.match(sf, /\{ hit: 'mtsa', id: a\.id, muni: a\.municipality \}\);/);
  // plants, South Peel, zones, station catchments, drainage (blocks): their servicing scope
  assert.equal((sf.match(/hit: 'svc', ss: /g) || []).length, 5);
  assert.match(sf, /go: \(\) => SS\(\)\.open\(`plant:\$\{pl\}`\), hit: 'svc', ss: `plant:\$\{pl\}` \}/);
  assert.match(sf, /go: \(\) => SS\(\)\.open\('wsys:lake'\), hit: 'svc', ss: 'wsys:lake' \}/);
  // a DC line: the DC impact model's project key, as Capital › DC timing's rows carry it
  assert.match(sf, /hit: 'dc', key: `\$\{sys\}:\$\{k\}` \}/);
  assert.match(sf, /const k = ln\.p \|\| ln\.c;/);
  assert.match(src('js/dc-impact.js'), /const projectKey = ln => ln\.p \|\| ln\.c \|\| null;/);
  assert.match(src('js/dc-projects.js'), /data-dcproj-open="\$\{esc\(`\$\{pr\.sys\}:\$\{pr\.key\}`\)\}"/);
  assert.match(src('js/dc-projects.js'), /select: k => setS\('sel', k\)/);
  assert.match(sf, /hit: 'dcfac' \}/);
});

// A zone, station or block hit opens only once the servicing lookup is filled (js/svc-data.js svcById,
// after the optional files: dc-infra and the rest); until then it is not offered, the "still loading"
// note stands, and a pick never lands on an empty map view.
test('servicing hits are offered once they open: zones, stations and blocks after the servicing lookup', () => {
  const placeMatches = new Function('App', 'SD', 'window', `${body(sf, '  function placeMatches(ql) {')}\n  }\nreturn placeMatches;`);
  const zone = { id: 'pz:5', name: 'Pressure zone 5' }, ps = { id: 'dr:ps:7', name: 'Lisgar PS' }, block = { id: 'dr:B5', name: 'Block 5', kind: 'block' };
  const state = { areas: null, dcInfra: null, servicing: { zones: [zone], psAreas: [ps], drainage: [block] } }, svcById = new Map();
  const NAME = { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson', Inglewood: 'Inglewood' };
  const pm = placeMatches(() => ({ state }), () => ({ svcById, PLANT_NAME: NAME, PLANT_SHORT: NAME, plantLabel: pl => `${pl} plant`, drName: a => a.name }), {});
  const hits = q => pm(q).map(x => x.place.ss);
  // The servicing areas in, their lookup not yet: plants and South Peel (they resolve without it) only.
  assert.deepEqual(plain([hits('zone 5'), hits('lisgar'), hits('block 5')]), [[], [], []]);
  assert.deepEqual(plain([hits('clarkson'), hits('south peel')]), [['plant:Clarkson'], ['wsys:lake']]);
  // Filled: each its scope.
  for (const a of [zone, ps, block]) svcById.set(a.id, a);
  assert.deepEqual(plain([hits('zone 5'), hits('lisgar'), hits('block 5')]), [['pz:5'], ['dr:ps:7'], ['dr:B5']]);
  assert.match(sf, /const SS = \(\) => window\.PeelSvcScope, ready = SD\(\)\.svcById\.size > 0;/);
  // (the note under the results holds through that window: the lookup is filled with dcInfra, js/svc-data.js)
  assert.match(src('js/svc-data.js'), /App\(\)\.state\.dcInfra = DI\(\)\.prepDc\(dc\);\n\s+SP\(\)\.renderRefs\(\);\n\s+for \(const a of \[\.\.\.App\(\)\.state\.servicing\.zones, \.\.\.App\(\)\.state\.servicing\.drainage, \.\.\.App\(\)\.state\.servicing\.psAreas\]\) svcById\.set\(a\.id, a\);/);
});

test('a pick on a page is routed; the full map and a workspace map view keep the search’s own code', () => {
  const g = body(sf, '  function goSug(x) {');
  const blur = g.indexOf("const W = window.PeelWorkspaces, onPage = !!(W && W.mode && W.mode() === 'home'); if (onPage) $('#f-search').blur();");
  const filter = g.indexOf('if (x.filter) { filterBy(x.filter); return; }');
  const route = g.indexOf('if (onPage && W.routePick && W.routePick(x)) return;');
  const dev = g.indexOf('if (x.p) { Nav().showDetail(x.p); return; }');
  assert.ok(blur > 0 && blur < filter, 'on a page a pick lets go of the box first (the page then renders at once)');
  assert.ok(filter < route && route < dev, 'routed after the filter item, before the map’s own handling');
  // The places still loading: a note under the results, never an item (no data-i: a tap, Enter and
  // the arrows never reach it), and no "loading" item (that starts an address lookup).
  assert.match(sf, /'<li class="sug-h sug-wait" role="presentation">Plans, facilities and DC projects are still loading…<\/li>'/);
  assert.match(sf, /wait = sugItems\.length && \(!S\.areas \|\| !S\.servicing \|\| !S\.dcInfra\) \?/);
  assert.equal((sf.match(/loading: true/g) || []).length, 1, 'the address lookup’s row is the only loading item');
  assert.match(src('css/app.css'), /\.search-sug \.sug-wait \{ text-transform: none; font-weight: 400; \}/);
});

test('pageRoute: what each hit opens on a page (navigation design §3.3)', () => {
  const p = { key: 'k1', title: '1 Main St' };
  assert.deepEqual(plain(W.pageRoute({ label: 'x', p }, 'home')), { page: 'site', dev: 'k1', sec: 'summary' }, 'a development: its page on Summary');
  assert.deepEqual(plain(W.pageRoute({ label: 'x', p }, 'growth')), { page: 'site', dev: 'k1', sec: 'summary' });
  assert.deepEqual(plain(W.pageRoute({ label: 'x', p }, 'fsr')), { page: 'fsr', dev: 'k1', sec: 'summary' }, 'from Review an FSR: its FSR review');
  assert.deepEqual(plain(W.pageRoute({ label: 'x', p, hit: 'file', ref: 'OZ-21-005' }, 'fsr')), { page: 'site', dev: 'k1', sec: 'files', file: 'OZ-21-005' }, 'a file number: its page at Files');
  assert.deepEqual(plain(W.pageRoute({ place: { hit: 'plan', id: 'sp7', muni: 'Brampton' } }, 'home')), { page: 'growth', drill: 'a:sp7', fall: 'm:Brampton', muni: 'Brampton', sp: 'sp7' }, 'a plan: Growth in an area at it (a plan filter holding it may stay)');
  assert.deepEqual(plain(W.pageRoute({ place: { hit: 'mtsa', id: 'mt3', muni: 'Mississauga' } }, 'home')), { page: 'growth', drill: 'm:Mississauga', muni: 'Mississauga', then: 'map' }, 'an MTSA: at its municipality, then its filter');
  assert.deepEqual(plain(W.pageRoute({ place: { hit: 'mtsa', id: 'mt4' } }, 'home')), { page: 'growth', drill: 'peel', muni: '', then: 'map' });
  assert.deepEqual(plain(W.pageRoute({ place: { hit: 'svc', ss: 'plant:Lakeview' } }, 'week')), { ws: 'tight', ss: 'plant:Lakeview' }, 'a facility: its scope on Servicing capacity’s map');
  assert.deepEqual(plain(W.pageRoute({ place: { hit: 'dc', key: 'wastewater:25-2269' } }, 'home')), { page: 'projects', wsec: 'timing', dcSel: 'wastewater:25-2269' }, 'a DC project: Capital › DC timing at it');
  assert.deepEqual(plain(W.pageRoute({ place: { hit: 'dcfac' } }, 'home')), { ws: 'projects', then: 'map' }, 'a DC facility: Capital’s map, then its card');
  assert.deepEqual(plain(W.pageRoute({ label: '1 Main St', g: { lat: 43.7, lng: -79.7 } }, 'home')), { ws: 'site', then: 'map' }, 'an address: Check a site’s map, then its pin');
  assert.equal(W.pageRoute({ label: 'Filter the list by “x”', filter: 'x' }, 'home'), null, 'the filter row');
  assert.equal(W.pageRoute({ label: 'x', loading: true }, 'home'), null, 'an address lookup still out');
  assert.equal(W.pageRoute(null, 'home'), null);
  // Every destination is an existing page or map view (no alias needed: nothing moved, §7).
  const hits = [{ p }, { p, hit: 'file', ref: 'r' }, { place: { hit: 'plan', id: 'a', muni: 'm' } }, { place: { hit: 'mtsa', id: 'a' } }, { place: { hit: 'svc', ss: 's' } }, { place: { hit: 'dc', key: 'k' } }, { place: { hit: 'dcfac' } }, { g: {} }];
  for (const pg of ['home', 'fsr']) for (const x of hits) { const r = W.pageRoute(x, pg); const id = r.page || r.ws; assert.ok(W.BY_ID[id], `${id} is a workspace`); }
});

test('the browser half: the page gate, the pick’s place set before its page opens, the file marked', () => {
  const w = src('js/workspaces.js');
  const r = body(w, '  function routePick(x) {');
  assert.match(r, /^ {2}function routePick\(x\) \{\n {4}if \(mode !== 'home'\) return false;/, 'pages only (the map’s picks never routed)');
  // A development: the Explore hook told first, the development opened, its section set, then its page.
  const at = s => { const i = r.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('exploreDev = `dev:${r.dev}`; pickDev(r.dev);') < at('WP.siteAt(r.dev, r.sec, r.file || null);') && at('WP.siteAt(') < at('openPage(r.page);'));
  assert.ok(at('WP.drillTo(r.drill, r.fall);') < at("openPage('growth');"));
  // (a filter that leaves the pick out of the plan tree goes first: Home's municipality, the map's plan
  // or MTSA filter; once, before the drill)
  assert.match(r, /muniOff = !!\(S\.muni && S\.muni !== r\.muni\)/, 'a plan in another municipality than Home’s: Peel first');
  assert.match(r, /areaOff = !!\(sp\.length \|\| mt\.length\) && !\(r\.sp && !mt\.length && sp\.includes\(r\.sp\)\);/, 'a plan or MTSA filter: off, unless a plan filter holding the plan');
  assert.ok(at('if (A.applyFilters) A.applyFilters(); }') < at('WP.drillTo(r.drill, r.fall);'), 'filters applied before the drill');
  // A servicing scope that does not open yet: the pick is taken, nothing moves (no closed scopes).
  assert.ok(at('if (r.ss && SS() && SS().resolve && !SS().resolve(r.ss)) return true;') < at('go(r.ws, { ss: r.ss, quiet: true });'));
  assert.match(r, /const D = root\.PeelDcProjects; if \(D && D\.select\) D\.select\(r\.dcSel\);/);
  assert.match(r, /return r\.then !== 'map';/);
  // The places the pick lands at (js/ws-pages.js): the same reset as a step up a site's trail.
  const p = src('js/ws-pages.js');
  assert.match(p, /const siteAt = \(key, sec, file\) => \{ siteSec = sec \|\| 'summary'; siteSecDev = key; siteFile = file \|\| null; siteFileShown = false; \};/);
  assert.match(p, /gAt = !r \|\| has\(id\) \? id : has\(fall\) \? fall : 'peel'; gStage = 'all'; gAll = false; gEst = false; gSec = 'growth';/);
  assert.match(p, /const sectionAt = \(ws, id\) => \{ wsSec\[ws\] = id; \};/);
  // The file marked: the tree row's own button (not the header's latest file or the figure), its fold
  // of earlier files opened; scrolled to once; cleared with a new development or a section button.
  const m = body(p, '  function markFile(host, ref) {');
  assert.match(m, /host\.querySelector\(`\.tr-row > div > \.tr-ref\[data-dev-file="\$\{CSS\.escape\(ref\)\}"\]`\), row = b && b\.closest\('\.tr-row'\)/);
  assert.match(m, /const fold = row\.closest\('details\.tr-same'\); if \(fold && !fold\.open\) fold\.open = true;/);
  assert.match(m, /row\.classList\.add\('tr-hit'\);\n {4}if \(!siteFileShown\) \{ siteFileShown = true; row\.scrollIntoView\(\{ block: 'center' \}\); \}/);
  assert.match(p, /const b = sec \|\| s, ref = on === 'files' \? siteFile : null;/);
  assert.match(p, /if \(siteSecDev !== p\.key\) \{ siteSec = 'summary'; siteSecDev = p\.key; siteFile = null; \}/);
  assert.match(p, /if \(t\.dataset\.wsSec\) \{ siteSec = t\.dataset\.wsSec; siteFile = null; \}/);
  assert.match(src('css/app.css'), /\.tr-hit \{ outline: 2px solid var\(--focus\);/);
  // (the file tree's row: the button sits in the row's second cell)
  assert.match(src('js/file-tree.js'), /return `<div class="tr-row">\$\{dot\(r && r\.stage \|\| 'review'\)\}<div><button type="button" class="tr-ref" data-dev-file=/);
});
