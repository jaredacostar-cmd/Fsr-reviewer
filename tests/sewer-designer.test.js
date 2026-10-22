'use strict';
// Labs: the Sewer designer (js/sewer-designer.js): the drawn line, its bends, the design as CSV.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SDR = require('../js/sewer-designer.js');
const SD = require('../js/sewer-design.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('chainage along the drawn line, and the bend at each vertex', () => {
  const k = 1 / (111320 * Math.cos(43.7 * Math.PI / 180));
  const pts = [{ lat: 43.7, lng: -79.7 }, { lat: 43.7, lng: -79.7 + 100 * k }, { lat: 43.7 + 100 / 111320, lng: -79.7 + 100 * k }];
  const xs = SDR.chainage(pts);
  assert.ok(Math.abs(xs[1] - 100) < 0.5 && Math.abs(xs[2] - 200) < 1);
  assert.deepEqual(SDR.bends(pts), [0, 90, 0]);
  const mid = SDR.pointAt(pts, xs, 50);
  assert.ok(Math.abs(mid.lng - (-79.7 + 50 * k)) < 1e-6);
});

test('the design as CSV: every maintenance hole and reach, the flow, the rules and the screening note', () => {
  const route = { nodes: SD.placeMHs([0, 240], 120).map(x => ({ x, g: 180, bend: 0 })), samples: [] };
  const d = SD.design(route, { invert: 174, dmm: 375 }, 8);
  const c = SDR.csv(d);
  assert.match(c, /^Maintenance hole,Chainage \(m\),Ground \(m\),Invert in \(m\),Invert out \(m\),Depth to invert \(m\),Drop \(m\),Drop structure/);
  assert.match(c, /MH 3 \(connection\),240\.00,180\.00/);
  assert.match(c, /Reach,Diameter \(mm\),Length \(m\),Slope \(%\)/);
  assert.match(c, /MH 1 to MH 2,200,120\.00,1\.000/);
  assert.match(c, /Design flow \(L\/s\),8\.00/);
  assert.match(c, /Linear Wastewater Standards/);
  assert.match(c, /General screening results only\. Peel's W&WW Infrastructure Planning team must validate or confirm all results\./);
});

test('wired: a Labs switch, a tool on the rail (hidden while off), the last tap snaps to a sewer', () => {
  assert.ok(require('../js/labs.js').IDS.includes('sewer'));
  assert.match(src('js/area-select.js'), /\['sewer', 'Sewer designer', /);
  assert.match(src('css/app.css'), /html:not\(\.lab-sewer\) \.tool-rail \[data-tool="sewer"\]/);
  const s = src('js/sewer-designer.js');
  assert.match(s, /T\(\)\.register\('sewer', \{/);
  assert.match(s, /\(await MS\(\)\.mainsNear\(end\.lat, end\.lng, 40\)\)\.filter\(m => !m\.fm && m\.up > 0 && m\.dn > 0 && m\.d > 0\)/);
  assert.match(s, /const atUp = along <= 15, atDn = glen - along <= 15/);
  assert.match(s, /SW\(\)\.designNet\(S\.net\.net, S\.conn, \{ ici: f\.ici, avoidStructures: f\.avoid, dmm: \+f\.dmm \|\| null, slopes: sl \}\)/);
  // (the flow is typed: nothing is designed until it is, for the main line and every branch)
  assert.match(s, /S\.formMsg = missing \? `Type a flow, or the population, jobs and area, for branch \$\{missing \+ 1\}\.` : 'Type a design flow/);
  for (const f of ['js/sewer-designer.js']) { assert.ok(src('index.html').includes(`<script src="${f}?v=__BUILD__"></script>`)); assert.ok(src('sw.js').includes(`'${f}',`)); }
});

test('a network: the rules checked over every reach and junction, the CSV with sizes, flows and the line each hole is on', () => {
  // the trunk 0 → 1 → 2 → 3 (the connection), a branch 4 → 2
  const gf = (x, y) => 200 - x * 0.012 + y * 0.01, xy = [[0, 0], [150, 0], [300, 0], [420, 0], [300, 160]];
  const seg = (from, to, q) => { const [x0, y0] = xy[from], [x1, y1] = xy[to], L = Math.hypot(x1 - x0, y1 - y0); return { from, to, L, q, pts: Array.from({ length: Math.floor(L / 10) }, (_, k) => { const t = (k * 10 + 5) / L; return { d: k * 10 + 5, g: gf(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) }; }) }; };
  const net = { nodes: xy.map(([x, y]) => ({ g: gf(x, y), bend: 0 })), reaches: [seg(0, 1, 20), seg(1, 2, 20), seg(4, 2, 30), seg(2, 3, 50)] };
  const conn = { invert: 189, dmm: 450 }, d = SD.designNet(net, conn);
  assert.ok(d.ok, d.why);
  const c = SDR.checks(d, net, conn);
  assert.equal(c.length, 10);
  assert.deepEqual(c.filter(x => !x.pass).map(x => x.t), []);
  if (new Set(d.reaches.map(r => r.dmm)).size > 1) assert.match(c[0].t, /never a larger pipe into a smaller one/);
  assert.match(c[4].t, /of each branch/);
  // labelled as the designer labels them
  d.mhs.forEach((m, i) => { m.x = i; m.run = i === 4 ? 1 : 0; m.label = `MH ${i + 1}${i === d.root ? ' (connection)' : ''}`; });
  const csv = SDR.csv(d);
  assert.match(csv, /,On$/m);
  assert.match(csv, /MH 4 \(connection\),.*,main line/);
  assert.match(csv, /MH 5,.*,branch 2/);
  assert.match(csv, /Froude,Design flow \(L\/s\)/);
  assert.match(csv, /MH 3 to MH 4,\d+,120\.00,.*,50\.00$/m);
  assert.match(csv, /"\d+\.\d\d \/ \d+\.\d\d"/, 'both inverts in at the junction');
});

test('wired: branches drawn and joined to the sewer drawn, flows per branch, a profile for each line', () => {
  const s = src('js/sewer-designer.js');
  assert.match(s, /data-sd-act="branch">Add a branch/);
  assert.match(s, /if \(n\.m <= 30 && \(!best \|\| n\.m < best\.m\)\) best = \{ ri, m: n\.m, t: n\.t \}/);
  assert.match(s, /const vi = run\.xs\.findIndex\(v => Math\.abs\(v - x\) <= 10\);/);
  assert.match(s, /data-sd-view="\$\{ri\}"/);
  assert.match(s, /The pumped option takes the main line alone: remove the branches to use it\./);
});

test('crossings: a watermain at its assumed depth checked for 0.5 m, a storm sewer listed to check on site', () => {
  // a 250 mm reach east along y = 0 from x 0 to 100, invert 225.0 falling 1%, ground 230
  const reach = { a: [0, 0], b: [100, 0], inv_up: 225, S: 0.01, L: 100, dmm: 250, gUp: 230, gDn: 230 };
  const pipes = [
    { kind: 'water', d: 300, src: 'Region of Peel', paths: [[[30, -50], [30, 50]]] },      // top 228.3, bottom 228.0
    { kind: 'storm', d: 600, src: 'City of Brampton', paths: [[[70, -50], [70, 50]]] },
    { kind: 'water', d: 150, src: 'Region of Peel', paths: [[[150, -50], [150, 50]]] },     // beyond the reach
  ];
  const x = SDR.crossings([reach], pipes);
  assert.equal(x.length, 2);
  const w = x[0];
  assert.equal(w.kind, 'water'); assert.ok(near(w.along, 30, 1e-9));
  assert.ok(near(w.obvert, 225 - 0.3 + 0.25, 1e-9));
  assert.ok(near(w.otherTop, 230 - 1.7, 1e-9) && near(w.otherBottom, 228.0, 1e-9));
  assert.ok(near(w.clear, 228.0 - 224.95, 1e-9)); assert.equal(w.ok, true);
  assert.equal(x[1].kind, 'storm'); assert.equal(x[1].ok, null);
  // a sewer too close under the watermain: 0.4 m
  const tight = SDR.crossings([{ ...reach, inv_up: 227.35, S: 0 }], [pipes[0]])[0];
  assert.ok(near(tight.clear, 0.4, 1e-9)); assert.equal(tight.ok, false);
  assert.deepEqual(SDR.CROSS, { clearance: 0.5, wmCover: 1.7 });
});

test('wired: crossings looked up after each design, Follow roads on the banner, the road network loaded before the designer', () => {
  const s = src('js/sewer-designer.js');
  assert.match(s, /findCrossings\(\);\n    \}\n    openResult\(\); drawLine\(\);/);
  assert.match(s, /for \(const kind of \['water', 'storm'\]\) for \(const src of EP\.EXIST\[kind\]\)/);
  assert.match(s, /data-ptool-act="sd-roads"/);
  assert.match(s, /const r = await RN\.routeBetween\(last, ll\);/);
  const html = src('index.html');
  assert.ok(html.indexOf('js/road-net.js') > 0 && html.indexOf('js/road-net.js') < html.indexOf('js/sewer-designer.js'));
  assert.match(src('sw.js'), /'js\/road-net\.js',/);
});

test('the trench at the deepest is read along every reach, not only at the maintenance holes', () => {
  // 300 m of ground falling gently with a 4 m hump at 200 m, between maintenance holes at 100 and 300 m
  const gf = x => 200 - 0.01 * x + 4 * Math.exp(-(((x - 200) / 25) ** 2));
  const nodes = [0, 100, 300].map(x => ({ x, g: gf(x), bend: 0 })), samples = Array.from({ length: 30 }, (_, k) => ({ x: k * 10 + 5, g: gf(k * 10 + 5) }));
  const conn = { invert: gf(300) - 4, dmm: 375 }, net = SD.lineNet({ nodes, samples }, 10), d = SD.designNet(net, conn);
  assert.ok(d.ok, d.why);
  let worst = 0;
  d.reaches.forEach((r, i) => { for (const p of [{ d: 0, g: net.nodes[r.from].g }, ...net.reaches[i].pts, { d: r.L, g: net.nodes[r.to].g }]) worst = Math.max(worst, p.g - (r.inv_up - r.S * p.d) + 0.15); });
  const dp = SD.deepest(d, net);
  assert.ok(near(dp.trench, worst, 1e-6) && near(dp.trench, dp.depth + 0.15, 1e-9));
  assert.ok(dp.depth > Math.max(...d.mhs.map(m => m.depth)) + 3, 'under the hump, well below the maintenance holes');
  const c = SDR.checks(d, net, conn).find(x => /^Trench/.test(x.t));
  // was 2.89 m (the deepest maintenance hole + 0.15)
  assert.equal(c.val, `${worst.toFixed(2)} m at the deepest`);
  assert.equal(c.val, '6.71 m at the deepest');
  // the panel's and the print sheet's "deepest" follow it
  const s = src('js/sewer-designer.js');
  assert.match(s, /const deepest = SW\(\)\.deepest\(d, S\.net\.net\)\.depth/);
  assert.match(s, /deepest: SW\(\)\.deepest\(S\.d, S\.net\.net\),/);
});

test('crossings: the ground at a crossing is the reach\'s sample nearest it, not a line between the maintenance holes', () => {
  // ground 230 at both maintenance holes, a 2 m rise in the middle (samples every 10 m)
  const pts = Array.from({ length: 9 }, (_, k) => ({ d: (k + 1) * 10, g: k + 1 === 5 ? 232 : k + 1 === 4 || k + 1 === 6 ? 231 : 230 }));
  const reach = { a: [0, 0], b: [100, 0], inv_up: 225, S: 0.01, L: 100, dmm: 250, gUp: 230, gDn: 230, pts };
  const w = SDR.crossings([reach], [{ kind: 'water', d: 300, src: 'Region of Peel', paths: [[[52, -50], [52, 50]]] }])[0];
  // was 230.00 (between the holes): top 228.30, 3.27 m clear; now the sample at 50 m, 232.00
  assert.equal(w.ground, 232);
  assert.ok(near(w.otherTop, 232 - 1.7, 1e-9) && near(w.otherBottom, 230.0, 1e-9));
  assert.ok(near(w.clear, 230.0 - (225 - 0.52 + 0.25), 1e-9), `${w.clear}`);
  // without samples, the nearest end
  assert.equal(SDR.crossings([{ ...reach, pts: undefined, gDn: 231 }], [{ kind: 'water', d: 300, paths: [[[70, -50], [70, 50]]] }])[0].ground, 231);
  assert.match(src('js/sewer-designer.js'), /gUp: d\.mhs\[r\.from\]\.g, gDn: d\.mhs\[r\.to\]\.g, pts: NR\[i\]\.pts \}/);
});

test('the bend into the existing sewer: from the last reach to the existing pipe\'s direction of flow', () => {
  const k = 1 / (111320 * Math.cos(43.7 * Math.PI / 180));
  // the existing pipe flows east (its upstream end first), 200 m; the connection halfway
  const g = [[-79.7, 43.7], [-79.7 + 200 * k, 43.7]], at = { lat: 43.7, lng: -79.7 + 100 * k };
  assert.equal(SDR.connBend({ lat: 43.7 + 50 / 111320, lng: at.lng }, at, g, 0.5), 90);   // a lateral from the north
  assert.equal(SDR.connBend({ lat: 43.7, lng: at.lng - 50 * k }, at, g, 0.5), 0);         // straight on
  assert.equal(SDR.connBend({ lat: 43.7 + 50 / 111320, lng: at.lng - 50 * k }, at, g, 0.5), 45);
  assert.equal(SDR.connBend({ lat: 43.7, lng: at.lng - 50 * k }, at, g, 0), 0, 'at its upstream maintenance hole: this pipe out');
  // a pipe that turns: the segment the connection is on
  const bentPipe = [[-79.7, 43.7], [-79.7 + 100 * k, 43.7], [-79.7 + 100 * k, 43.7 - 100 / 111320]], at2 = { lat: 43.7 - 50 / 111320, lng: -79.7 + 100 * k };
  assert.equal(SDR.connBend({ lat: at2.lat, lng: at2.lng - 50 * k }, at2, bentPipe, 0.75), 90);
  // at its downstream maintenance hole the pipe out is not known: no bend counted
  assert.equal(SDR.connBend({ lat: 43.7 + 50 / 111320, lng: at.lng }, { lat: 43.7, lng: g[1][0] }, g, 1), null);
  // wired: the reach into the connection takes it, so the velocity head rule applies there
  const s = src('js/sewer-designer.js');
  assert.match(s, /const b = connBend\(meta\[r\.from\]\.ll, meta\[rootN\]\.ll, S\.conn\.g, S\.conn\.t\); if \(b != null\) r\.bend = b;/);
  assert.match(s, /existingMH: atUp \|\| atDn, g: m\.g, t \};/);
});

test('a 90° bend into the existing sewer: the velocity head rule\'s least drop holds at the connection (450 mm)', () => {
  const gf = x => 200 - 0.02 * x, net = SD.lineNet({ nodes: [0, 80, 160].map(x => ({ x, g: gf(x), bend: 0 })), samples: [] }, 250), conn = { invert: gf(160) - 4, dmm: 900 };
  const straight = SD.designNet(net, conn);
  assert.ok(straight.ok, straight.why);
  const hv = r => 0.5 * r.v * r.v / (2 * 9.81);
  // no bend counted (as before): a 0.19 m drop at 2.89 m/s, under half its velocity head (0.21 m)
  assert.equal(straight.mhs[straight.root].ins[0].drop, 0.19);
  assert.ok(hv(straight.reaches[1]) > 0.2);
  net.reaches[1].bend = 90;
  const bent = SD.designNet(net, conn), x = bent.mhs[bent.root].ins[0];
  assert.ok(bent.ok, bent.why);
  assert.ok(x.drop >= hv(bent.reaches[1]) - 1e-6, `${x.drop} vs ${hv(bent.reaches[1])}`);
  assert.ok(bent.cost > straight.cost);
});

test('the slope range typed in the form: 0.3–1% by default, both blank the standard\'s, else a message', () => {
  assert.deepEqual(SDR.slopeRange({ sLo: '0.3', sHi: '1.0' }), [0.003, 0.01]);
  assert.equal(SDR.slopeRange({ sLo: '', sHi: ' ' }), null);
  assert.match(SDR.slopeRange({ sLo: '0.3', sHi: '' }).msg, /both slopes/);
  assert.match(SDR.slopeRange({ sLo: '1', sHi: '0.5' }).msg, /swap/);
  assert.match(SDR.slopeRange({ sLo: '-1', sHi: '1' }).msg, /both slopes/);
  // the designer's form starts at 0.3–1% and passes it to the design
  const s = src('js/sewer-designer.js');
  assert.match(s, /sLo: '0\.3', sHi: '1\.0'/);
  assert.match(s, /designNet\(S\.net\.net, S\.conn, \{ ici: f\.ici, avoidStructures: f\.avoid, dmm: \+f\.dmm \|\| null, slopes: sl \}\)/);
  // the Gravity check (design()) keeps the standard's slopes
  assert.doesNotMatch(src('js/lab-checks.js'), /slopes:/);
});

test('the rules checked within a range: the slopes row, and a reach held at the steepest flagged on velocity', () => {
  const gf = x => 200 - x * 0.03, rt = { nodes: SD.placeMHs([0, 360], 120).map(x => ({ x, g: gf(x), bend: 0 })), samples: Array.from({ length: 36 }, (_, k) => ({ x: k * 10 + 5, g: gf(k * 10 + 5) })) };
  const net = SD.lineNet(rt, 3), conn = { invert: gf(360) - 6, dmm: 600 }, d = SD.designNet(net, conn, { slopes: [0.003, 0.01] });
  assert.ok(d.ok, d.why);
  const c = SDR.checks(d, net, conn);
  assert.equal(c.length, 11);
  assert.match(c[0].t, /^Slopes \(0\.30%–1\.00%, the range chosen\)$/);
  assert.ok(c[0].pass);
  const v = c.find(x => /^Velocity at the design flow/.test(x.t));
  assert.ok(!v.pass);
  assert.match(v.val, /3 reaches held at 1\.00%, the steepest chosen \(0\.75 m\/s needs \d\.\d\d%\)/);
  assert.match(SDR.csv(d), /Slopes chosen \(%\),0\.30–1\.00/);
  // without a range: no slopes row (ten rules, as before)
  assert.equal(SDR.checks(SD.designNet(net, conn), net, conn).length, 10);
});

test('Labs › Sewer designer: a page of its own in Home’s sidebar while its switch is on', () => {
  const W = require('../js/workspaces.js');
  assert.equal(W.LAB_PAGES.sewer.lab, 'sewer');
  assert.ok(require('../js/labs.js').IDS.includes(W.LAB_PAGES.sewer.lab));
  // a link to the page opens it (the page itself falls back to Home while the switch is off)
  assert.deepEqual(JSON.parse(JSON.stringify(W.startScreen({ hash: '#w=p:sewer' }))), { mode: 'home', page: 'sewer' });
  const ws = src('js/workspaces.js');
  assert.match(ws, /labIds\.length \? `<h2 class="home-g">Labs<\/h2>/);
  assert.match(ws, /if \(id !== 'home' && !BY_ID\[id\] && !REF\[id\] && !labPageOn\(id\)\) id = 'home';/);
  assert.match(ws, /else if \(slot\.dataset\.sewer != null\) sewerMap\(\);/);
  assert.match(ws, /new CustomEvent\('peel:page'/);
  // (the switch going off takes its page away, and the sidebar entry with it)
  assert.match(src('js/labs.js'), /W\.LAB_PAGES\[W\.page\(\)\]\.lab === id\) W\.openPage\('home'\); else W\.renderPage\(true\);/);
  assert.match(src('js/ws-pages.js'), /root\.PeelSewerDesigner\.page\(\)/);
});

test('the page: the map on it with the drawing controls, the design under it, not in the right panel', () => {
  const s = src('js/sewer-designer.js');
  assert.match(s, /data-sd-pbar-host/);
  assert.match(s, /id="page-map-slot" data-sewer/);
  assert.match(s, /data-psec="design" data-sd-phost/);
  // the result renders on the page while it is open, else in the right panel as before
  assert.match(s, /if \(onPage\(\)\) \{ renderPage\(\); return; \}\n {4}T\(\)\.openResult\(/);
  // the tool is on while the page is open; the design stays with the page when you leave it
  assert.match(s, /if \(d\.page === 'sewer'\) \{ S\.home = true; if \(T\(\)\.active\(\) !== 'sewer'\) \{ S\.keep = true; toolOn\(true\); \}/);
  assert.match(s, /if \(S\.home\) \{ if \(onPage\(\)\) \{ drawLine\(\); setTimeout\(renderPage, 0\); \} else if \(layer\) layer\.clearLayers\(\); return; \}/);
  // the page's buttons are the banner's
  assert.match(s, /#home \[data-sd-pbar-host\] \[data-ptool-act\]/);
  for (const t of ['Draw the route', 'What it serves', 'The design', 'Rules met', 'Maintenance holes', 'Pump duty']) assert.ok(s.includes(`'${t}'`), t);
  assert.match(src('css/app.css'), /\.page-map-slot\.sd-map-slot \{ height: min\(560px, 62vh\); \}/);
});

test('a size chosen: every reach at that size, or why not; the forcemain at the size chosen', () => {
  const gf = x => 200 - x * 0.012, seg = (from, to, x0, L, q) => ({ from, to, L, q, pts: Array.from({ length: Math.floor(L / 10) }, (_, k) => ({ d: k * 10 + 5, g: gf(x0 + k * 10 + 5) })) });
  const net = { nodes: [0, 150, 300].map(x => ({ g: gf(x), bend: 0 })), reaches: [seg(0, 1, 0, 150, 20), seg(1, 2, 150, 150, 20)] };
  const conn = { invert: 191, dmm: 450 };
  const auto = SD.designNet(net, conn);
  assert.ok(auto.ok, auto.why);
  const big = SD.designNet(net, conn, { dmm: 375 });
  assert.ok(big.ok, big.why);
  assert.deepEqual(big.reaches.map(r => r.dmm), [375, 375]);
  assert.ok(Math.min(...auto.reaches.map(r => r.dmm)) < 375, 'the tool picks a smaller size by itself');
  // larger than the existing sewer: refused, never sized up or down
  const over = SD.designNet(net, conn, { dmm: 525 });
  assert.equal(over.ok, false);
  assert.match(over.why, /525 mm would be larger than the existing 450 mm sewer/);
  assert.equal(SD.designNet(net, conn, { dmm: 333 }).ok, false);
  // the forcemain: the size chosen, its velocity checked
  const FM = require('../js/forcemain.js');
  const ground = Array.from({ length: 31 }, (_, i) => ({ x: i * 20, g: 190 + i * 0.05 }));
  const pick = FM.design(ground, { invert: 186, dmm: 375 }, 12);
  const at = FM.design(ground, { invert: 186, dmm: 375 }, 12, { dmm: 200 });
  assert.equal(at.dmm, 200); assert.equal(at.chosen, true); assert.equal(pick.chosen, false);
  assert.match(at.checks[0].t, /as chosen/);
  assert.equal(at.checks[0].pass, at.sizes.find(c => c.dmm === 200).ok);
  const s = src('js/sewer-designer.js');
  assert.match(s, /SW\(\)\.designNet\(S\.net\.net, S\.conn, \{ ici: f\.ici, avoidStructures: f\.avoid, dmm: \+f\.dmm \|\| null, slopes: sl \}\)/);
  assert.match(s, /sizeField\('dmm', SW\(\)\.SIZES\.filter\(d => d >= SW\(\)\.RULES\.dMin && \(!S\.conn \|\| d <= S\.conn\.dmm\)\), 'Smallest that works'\)/);
});
