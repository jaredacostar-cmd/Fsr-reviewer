'use strict';
// The preliminary forcemain and pump duty (js/forcemain.js): Peel's Linear Wastewater Standards s. 4
// on every design; the pumping station itself is left to the SPS Design Standard.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FM = require('../js/forcemain.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Ground every 10 m: a site in a hollow, the land rising 6 m to a shallow sewer 500 m away.
const ground = (L, gf) => Array.from({ length: L / 10 + 1 }, (_, i) => ({ x: i * 10, g: gf(i * 10) }));
const rising = x => 220 + x * 0.012 + Math.sin(x / 45) * 0.6;

test('Hazen-Williams with C 140, as s. 4.1 writes it (and the usual SI form agrees)', () => {
  const Q = 0.05, D = 0.2, L = 1000;
  const si = 10.67 * L * Math.pow(Q, 1.852) / (Math.pow(140, 1.852) * Math.pow(D, 4.87));
  assert.ok(near(FM.hf(Q, D, L), si, si * 0.01), `${FM.hf(Q, D, L)} vs ${si}`);
  assert.ok(near(FM.vel(0.0471, 0.2), 1.499, 0.001));
});

test('sizing: the largest size that still reaches 1.0 m/s (least head loss), 100 mm at the least', () => {
  assert.equal(FM.size(47.1).pick.dmm, 200);   // 250 mm would run at 0.96 m/s
  assert.equal(FM.size(47.1, { vfd: true }).pick.dmm, 250);   // 0.8 m/s with variable speed drives
  assert.equal(FM.size(2).pick, null);   // 0.25 m/s even in 100 mm
  for (const q of [8, 20, 47.1, 120, 400]) { const p = FM.size(q).pick; assert.ok(p.v >= 1.0 && p.v <= 3.0, `${q} L/s`); }
});

test('high and low points: turning points with 0.3 m either side, not the ends', () => {
  const t = FM.turns([{ x: 0, z: 0 }, { x: 10, z: 1 }, { x: 20, z: 0.2 }, { x: 30, z: 0.25 }, { x: 40, z: 1.5 }, { x: 50, z: 1.4 }]);
  assert.deepEqual(t.map(p => [p.x, p.kind]), [[10, 'high'], [20, 'low']]);
  assert.deepEqual(FM.turns([{ x: 0, z: 0 }, { x: 10, z: 0.2 }, { x: 20, z: 0.1 }, { x: 30, z: 0.3 }]), [], 'under 0.3 m: none');
});

test('a forcemain up the hill: every s. 4 rule, the outlet 0.3 m above the flow line, the duty point', () => {
  const G = ground(500, rising), conn = { invert: rising(500) - 3.2, dmm: 375 };
  const d = FM.design(G, conn, 47.1);
  assert.ok(d.ok, d.why);
  assert.equal(d.dmm, 200);
  assert.ok(d.v >= 1.0 && d.v <= 3.0);
  // cover along the line (not the discharge maintenance hole), the trench, the outlet
  d.prof.slice(0, -1).forEach(p => assert.ok(p.g - p.inv - 0.2 >= 2.5 - 1e-6, `cover at ${p.x}`));
  d.prof.forEach(p => assert.ok(p.g - p.inv + 0.15 <= 8.0 + 1e-6, `trench at ${p.x}`));
  assert.ok(d.outletInv >= conn.invert - 1e-9 && d.outletInv <= conn.invert + 0.3 + 1e-9);
  // the head: the static lift from the wet well (the incoming sewer, 2.7 m down) plus friction
  assert.ok(near(d.ww, rising(0) - 2.7, 1e-9));
  assert.ok(near(d.hf, FM.hf(0.0471, 0.2, 500), 1e-9));
  assert.ok(near(d.tdh, d.lift + d.hf + (d.over ? d.over.need : 0), 1e-9));
  assert.ok(near(d.curve(1), d.tdh, 1e-9));
  assert.ok(near(d.power, 9.81 * 0.0471 * d.tdh, 1e-9));
  assert.equal(d.checks.filter(c => !c.pass).length, 0, d.checks.filter(c => !c.pass).map(c => c.t).join('; '));
  // a typed wet well level: the static lift follows it
  const w = FM.design(G, conn, 47.1, { wwDepth: 5 });
  assert.ok(near(w.lift - d.lift, 5 - 2.7, 1e-9));
  assert.equal(w.wwAssumed, false);
});

test('over a hill: an air release at the top, a drain in the hollow after it; the grade line over the crest', () => {
  const hill = x => 220 + x * 0.004 + 3 * Math.exp(-(((x - 150) / 40) ** 2)) - 2 * Math.exp(-(((x - 300) / 40) ** 2));
  const d = FM.design(ground(450, hill), { invert: hill(450) - 3.2, dmm: 375 }, 30);
  assert.ok(d.highs.some(h => Math.abs(h.x - 150) <= 20), `highs ${d.highs.map(h => h.x)}`);
  assert.ok(d.lows.some(h => Math.abs(h.x - 300) <= 20), `lows ${d.lows.map(h => h.x)}`);
  assert.ok(d.tdh >= d.lift + d.hf - 1e-9);
});

test('it says when a forcemain won\'t do, and why', () => {
  const G = ground(300, rising);
  assert.match(FM.design(G, { invert: rising(300) - 3, dmm: 300 }, 2).why, /too small for 1\.0 m\/s in the 100 mm minimum/);
  assert.match(FM.design(G, { invert: rising(300) - 1, dmm: 300 }, 30).why, /receiving sewer is shallower than the forcemain's cover/);
  assert.match(FM.SOURCE, /Linear Wastewater Standards \(published Nov 2022, R1\.0 Mar 2023\), s\. 4/);
});

test('wired: the designer\'s pumped option, the station left to the SPS standard, loaded before the designer', () => {
  const s = src('js/sewer-designer.js');
  assert.match(s, /value="pumped"/);
  assert.match(s, /data-sd-act="pumped">Try a pumped option/);
  assert.match(s, /The pumping station is not sized here\.<\/strong> Size it to Peel's Sewage Pumping Station Design Standard/);
  assert.match(s, /A transient analysis is mandatory for every forcemain \(s\. 4\.3\.6\)/);
  const html = src('index.html');
  assert.ok(html.indexOf('js/forcemain.js') > 0 && html.indexOf('js/forcemain.js') < html.indexOf('js/sewer-designer.js'));
  assert.match(src('sw.js'), /'js\/forcemain\.js',/);
});

test('no size in 1.0–3.0 m/s: the closest one is shown, and why (100 mm for a small flow, 900 mm for a huge one)', () => {
  const G = ground(500, () => 200), conn = { invert: 196, dmm: 300 };
  // 3 L/s: every size under 1.0 m/s; was 900 mm at 0.005 m/s
  const s = FM.design(G, conn, 3);
  assert.equal(s.ok, false);
  assert.equal(s.dmm, 100);
  assert.ok(near(s.v, 0.382, 0.001));
  assert.match(s.why, /too small for 1\.0 m\/s in the 100 mm minimum \(0\.38 m\/s\)/);
  // 2,500 L/s: every size over 3.0 m/s; was 100 mm at 318 m/s
  const b = FM.design(G, conn, 2500);
  assert.equal(b.ok, false);
  assert.equal(b.dmm, 900);
  assert.ok(near(b.v, 3.93, 0.01));
  assert.match(b.why, /more than 3\.0 m\/s in the largest size \(900 mm, 3\.93 m\/s\)/);
});

test('the assumed wet well level says the cover it was taken at (3.5 m industrial / commercial)', () => {
  const G = ground(500, rising), conn = { invert: rising(500) - 3.2, dmm: 375 };
  const res = FM.design(G, conn, 47.1), ici = FM.design(G, conn, 47.1, { ici: true });
  assert.equal(res.wwNote, 'the incoming sewer: 2.5 m of cover over a 200 mm pipe');
  assert.equal(ici.wwNote, 'the incoming sewer: 3.5 m of cover over a 200 mm pipe');
  assert.ok(near(ici.ww, rising(0) - 3.7, 1e-9));
  assert.equal(FM.design(G, conn, 47.1, { wwDepth: 5 }).wwNote, '');
  const s = src('js/sewer-designer.js');
  assert.match(s, /f\.wwAssumed \? ` \(\$\{esc\(f\.wwNote\)\}/);
  assert.doesNotMatch(s, /2\.5 m of cover over a 200 mm pipe/);
});
