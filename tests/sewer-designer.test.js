'use strict';
// Labs: the Sewer designer (js/sewer-designer.js): the drawn line, its bends, the design as CSV.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SDR = require('../js/sewer-designer.js');
const SD = require('../js/sewer-design.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

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
  assert.match(s, /SW\(\)\.designNet\(S\.net\.net, S\.conn, \{ ici: f\.ici, avoidStructures: f\.avoid \}\)/);
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
