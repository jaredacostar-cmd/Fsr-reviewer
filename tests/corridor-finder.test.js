'use strict';
// Labs: the corridor finder (js/corridor-finder.js): along the roads, around the constraint areas
// where it can, a watercourse crossed only where it must, not climbing in the flow direction.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RN = require('../js/road-net.js');
const CF = require('../js/corridor-finder.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Streets 100 m apart: y = 0 and y = 100 from x 0 to 400, joined north–south every 100 m.
const streets = () => {
  const segs = [], id = (x, y) => `${x},${y}`;
  for (const y of [0, 100]) for (let x = 0; x < 400; x += 100) segs.push({ from: id(x, y), to: id(x + 100, y), pts: [[x, y], [x + 100, y]] });
  for (let x = 0; x <= 400; x += 100) segs.push({ from: id(x, 0), to: id(x, 100), pts: [[x, 0], [x, 100]] });
  return segs;
};
// A floodplain over y = 0 between x 150 and 250; a creek across y = 0 at x 320 (north–south, short).
const inside = (k, p) => k === 'flood' && p[0] > 150 && p[0] < 250 && Math.abs(p[1]) < 20;
const waters = [{ name: 'Fletchers Creek', segs: [[[320, -30], [320, 30]]] }];
const flat = () => 200;

test('what each road runs through: metres inside an area, the watercourses crossed, the rise', () => {
  const G = RN.graph(streets()), gOf = id => 200 + +id.split(',')[0] * 0.01;   // rising 1 m per 100 m east
  const I = CF.edgeInfo(G, inside, waters, gOf);
  const e = (a, b) => G.edges.findIndex(x => x.a === a && x.b === b);
  assert.ok(near(I[e('100,0', '200,0')].in.flood, 50, 1e-9));
  assert.ok(near(I[e('200,0', '300,0')].in.flood, 50, 1e-9));
  assert.deepEqual(I[e('300,0', '400,0')].water, ['Fletchers Creek']);
  assert.deepEqual(I[e('300,100', '400,100')].water, []);
  assert.ok(near(I[e('0,0', '100,0')].rise, 1, 1e-9));
  // the cost: length, the weighted metres inside, each crossing, a climb in the flow direction only
  const ed = G.edges[e('300,0', '400,0')], W = CF.WEIGHTS;
  assert.ok(near(CF.costOf(ed, I[e('300,0', '400,0')], true, W), 100 + 200 + 50 * 1, 1e-9));
  assert.ok(near(CF.costOf(ed, I[e('300,0', '400,0')], false, W), 100 + 200, 1e-9), 'downhill: no climb');
});

test('the route keeps out of the floodplain and off the creek crossing when another way costs less', () => {
  const G = RN.graph(streets()), I = CF.edgeInfo(G, inside, waters, flat), EI = new Map(G.edges.map((x, i) => [x, i]));
  const w = (ed, fwd) => CF.costOf(ed, I[EI.get(ed)], fwd) / ed.L;
  const best = RN.route(G, [0, 0], [400, 0], w), plain = RN.route(G, [0, 0], [400, 0]);
  assert.ok(near(plain.L, 400, 1e-9));
  const sb = CF.summary(G, I, best.edges), sp = CF.summary(G, I, plain.edges);
  assert.ok(near(sb.in.flood, 0, 1e-9) && sp.in.flood > 50, 'around the floodplain');
  assert.deepEqual(sb.water, [], 'no creek crossing when the north street goes round');
  assert.deepEqual(sp.water, ['Fletchers Creek']);
  assert.ok(near(best.L, 600, 1e-9), `${best.L}`);   // up to y = 100 and back down at x = 400
  // with the weights at nothing, the shortest way again
  const zero = Object.fromEntries(Object.keys(CF.WEIGHTS).map(k => [k, 0]));
  assert.ok(near(RN.route(G, [0, 0], [400, 0], (ed, fwd) => CF.costOf(ed, I[EI.get(ed)], fwd, zero) / ed.L).L, 400, 1e-9));
});

test('climbing in the flow direction costs: the route takes the way that falls', () => {
  // y = 100 street flat; y = 0 street has a hump at x 200 (5 m up then down)
  const G = RN.graph(streets()), gOf = id => { const [x, y] = id.split(',').map(Number); return y === 0 && x === 200 ? 205 : 200; };
  const I = CF.edgeInfo(G, () => false, [], gOf), EI = new Map(G.edges.map((x, i) => [x, i]));
  const r = RN.route(G, [0, 0], [400, 0], (ed, fwd) => CF.costOf(ed, I[EI.get(ed)], fwd) / ed.L);
  assert.ok(r.pts.some(p => p[1] === 100), 'round the hump');
  assert.ok(near(CF.summary(G, I, r.edges).up, 0, 1e-9));
});

test('the weights are the tool\'s, shown and adjustable; wired into the Sewer designer', () => {
  assert.deepEqual(CF.WEIGHTS, { flood: 4, natural: 4, reg: 1, nhs: 1, plan: 1, water: 200, up: 50 });
  const s = src('js/sewer-designer.js');
  assert.match(s, /Route weights \(the tool's, not Peel's\)/);
  assert.match(s, /data-ptool-act="sd-find"/);
  assert.match(s, /each crossing needs the conservation authority's permit and 2\.0 m from the bed to the top of the pipe \(s\. 3\.4\.2\.2\)/);
  const html = src('index.html');
  assert.ok(html.indexOf('js/corridor-finder.js') > html.indexOf('js/road-net.js') && html.indexOf('js/corridor-finder.js') < html.indexOf('js/sewer-designer.js'));
  assert.match(src('sw.js'), /'js\/corridor-finder\.js',/);
});
