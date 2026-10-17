'use strict';
// Labs: the Sewer designer's 11×17 plan and profile (js/sewer-print.js): true scales, every
// maintenance hole on both views, a title block without names, the screening note.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SP = require('../js/sewer-print.js');
const SD = require('../js/sewer-design.js');
const SDR = require('../js/sewer-designer.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// A drawn route: 200 m east, then 120 m north-east, on falling ground, to a 450 mm sewer.
const k = 1 / (111320 * Math.cos(43.7 * Math.PI / 180));
const pts = [{ lat: 43.7, lng: -79.75 }, { lat: 43.7, lng: -79.75 + 200 * k }, { lat: 43.7 + 85 / 111320, lng: -79.75 + 285 * k }];
const xs = SDR.chainage(pts), Lt = xs[xs.length - 1];
const gf = x => 232 - x * 0.012;
const mhX = SD.placeMHs(xs, 190);
const nodes = mhX.map(x => ({ x, g: gf(x), bend: 0, ll: SDR.pointAt(pts, xs, x) }));
const ground = Array.from({ length: Math.ceil(Lt / 10) + 1 }, (_, i) => Math.min(Lt, i * 10)).map(x => ({ x, g: gf(x) }));
const route = { nodes: nodes.map(({ x, g, bend }) => ({ x, g, bend })), samples: ground.filter(s => !mhX.some(x => Math.abs(x - s.x) < 0.01)) };
const conn = { lat: pts[2].lat, lng: pts[2].lng, invert: 222.5, dmm: 450, id: 'SAN-1', existingMH: false };
const net = SD.lineNet(route, 30), d = SD.designNet(net, conn);
d.mhs.forEach((m, i) => { m.x = nodes[i].x; });
const dt = {
  d, nodes, ground, pts, conn, mains: [{ g: [[pts[2].lng - 50 * k, pts[2].lat - 50 / 111320], [pts[2].lng + 50 * k, pts[2].lat + 50 / 111320]], d: 450, id: 'SAN-1', conn: true }],
  flow: { q: 30, typed: true }, groundLabel: 'Ontario lidar DTM', checks: SDR.checks(d, net, conn), froudeHi: 0,
  where: 'From 0 HERITAGE RD', date: 'October 17, 2026', version: 'test', unofficial: 'Unofficial prototype', source: SD.SOURCE,
  note: 'General screening results only. Peel’s W&WW Infrastructure Planning team must validate or confirm all results.',
};

test('scales: the largest drawing that fits, chainage as 0+000.0, a round scale bar', () => {
  assert.ok(d.ok, d.why);
  assert.equal(SP.pickScale(300, 290), 1250);   // 300 m in 290 mm: 1:1000 would be 300 mm, 1:1250 is 240 mm
  assert.equal(SP.pickScale(240, 290), 1000);
  assert.equal(SP.pickScale(4, 100, SP.VSCALES), 50);
  assert.equal(SP.chain(0), '0+000.0'); assert.equal(SP.chain(190), '0+190.0'); assert.equal(SP.chain(1234.56), '1+234.6');
  assert.equal(SP.barLength(1000), 50); assert.equal(SP.barLength(2000), 100);
});

test('the plan: drawn in millimetres at a standard scale, every maintenance hole, the reach labels, north and a scale bar', () => {
  const { svg, scale } = SP.planSVG(dt, 300, 138);
  assert.ok(SP.SCALES.includes(scale));
  assert.match(svg, /width="300mm" height="138mm" viewBox="0 0 300 138"/);
  assert.equal((svg.match(/class="pl-mh"/g) || []).length, d.mhs.length);
  assert.equal((svg.match(/class="pl-rl"/g) || []).length, d.reaches.length);
  assert.match(svg, /450 mm sanitary · SAN-1/);
  assert.match(svg, />N<\/text>/);
  assert.match(svg, new RegExp(`Plan 1:${scale.toLocaleString('en-CA')}`));
  assert.match(svg, /Connection: new MH on the pipe, 450 mm, invert 222\.50/);
});

test('the profile: horizontal and vertical scales, the pipe, each maintenance hole and its chainage, ground and inverts', () => {
  const { svg, hs, vs } = SP.profileSVG(dt, 300, 116);
  assert.ok(SP.SCALES.includes(hs) && SP.VSCALES.includes(vs));
  assert.ok(Lt * 1000 / hs <= 300 - 24, 'the route fits across');
  assert.equal((svg.match(/class="pp-pipe"/g) || []).length, d.reaches.length);
  assert.equal((svg.match(/class="pp-mh( pp-drop)?"/g) || []).length, d.mhs.length);
  assert.equal((svg.match(/class="pp-bv"/g) || []).length, 4 * d.mhs.length);
  assert.match(svg, /0\+000\.0/);
  assert.match(svg, new RegExp(`horizontal 1:${hs.toLocaleString('en-CA')} · vertical 1:${vs}`));
});

test('the sheets: 11×17 landscape, the title block (preliminary, no names), the rules, the tables, the note', () => {
  const s = SP.sheetHTML(dt);
  assert.match(s.css, /@page\{size:17in 11in;margin:10mm\}/);
  assert.equal((s.body.match(/class="sheet /g) || []).length, 2);
  assert.match(s.body, /PRELIMINARY · NOT FOR CONSTRUCTION/);
  assert.match(s.body, /Preliminary sanitary sewer<br>Plan and profile/);
  assert.match(s.body, /Sheet 1 of 2/); assert.match(s.body, /Sheet 2 of 2/);
  assert.match(s.body, /From 0 HERITAGE RD/);
  assert.ok(!/Prepared by|prepared by/.test(s.body), 'no names');
  assert.equal((s.body.match(/<li class="ok">/g) || []).length, 10, 'all ten rules pass');
  assert.match(s.body, /General screening results only\. Peel’s W&amp;WW Infrastructure Planning team must validate or confirm all results\./);
  assert.match(s.body, /Print at 100%/);
  assert.match(s.body, /<h2>Legend<\/h2>/);
  assert.match(s.body, /the least excavation the rules allow/);
});

test('wired: the designer\'s print button, the report window takes the sheet\'s stylesheet, loaded before the designer', () => {
  const s = src('js/sewer-designer.js');
  assert.match(s, /data-sd-act="print">Print plan and profile \(11×17\)/);
  assert.match(s, /else if \(act === 'print'\) printSheet\(\);/);
  assert.match(src('js/reports.js'), /function openReport\(title, body, opts = \{\}\)[\s\S]*<style>\$\{opts\.css \|\| REPORT_CSS\}<\/style>/);
  const html = src('index.html');
  assert.ok(html.indexOf('js/sewer-print.js') > 0 && html.indexOf('js/sewer-print.js') < html.indexOf('js/sewer-designer.js'));
  assert.match(src('sw.js'), /'js\/sewer-print\.js',/);
});

test('the sheet\'s "at the deepest" is the deepest along the reaches the designer passes in', () => {
  const dp = SD.deepest(d, net);
  assert.ok(dp.depth >= Math.max(...d.mhs.map(m => m.depth)) - 1e-9);
  const html = SP.sheetHTML({ ...dt, deepest: { depth: 7.26, trench: 7.41 } }).body;
  assert.match(html, /7\.3 m at the deepest/);
  assert.equal((html.match(/7\.3 m at the deepest/g) || []).length, 2, 'the title block and the summary');
});
