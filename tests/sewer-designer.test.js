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
  assert.match(s, /SW\(\)\.design\(S\.route, S\.conn, flow\.q, \{ ici: f\.ici, avoidStructures: f\.avoid \}\)/);
  // (the flow is typed: nothing is designed until it is)
  assert.match(s, /if \(!\(flow\.q > 0\)\) \{ S\.d = null; S\.formMsg = 'Type a design flow/);
  for (const f of ['js/sewer-designer.js']) { assert.ok(src('index.html').includes(`<script src="${f}?v=__BUILD__"></script>`)); assert.ok(src('sw.js').includes(`'${f}',`)); }
});
