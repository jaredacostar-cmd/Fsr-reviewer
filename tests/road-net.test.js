'use strict';
// Road centrelines for routing (js/road-net.js): the Ontario Road Network as a graph of junctions,
// the shortest way along the roads, and the straight runs a sewer takes on a curved road.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RN = require('../js/road-net.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// A grid of streets 100 m apart (junction "x,y"), and one long way round on the east side.
const grid = () => {
  const segs = [], id = (x, y) => `${x},${y}`;
  for (let x = 0; x <= 300; x += 100) for (let y = 0; y <= 200; y += 100) {
    if (x < 300) segs.push({ from: id(x, y), to: id(x + 100, y), pts: [[x, y], [x + 100, y]] });
    if (y < 200) segs.push({ from: id(x, y), to: id(x, y + 100), pts: [[x, y], [x, y + 100]] });
  }
  return segs;
};

test('the shortest way along the roads, from a tap near one street to a tap near another', () => {
  const G = RN.graph(grid());
  assert.equal(G.nodes.size, 12);
  const r = RN.route(G, [40, -6], [300, 160]);   // off Street y=0 at x 40, off Street x=300 at y 160
  assert.ok(r);
  assert.ok(near(r.L, 260 + 160, 1e-6), `${r.L}`);   // east along y = 0 to x = 300, then north to y = 160
  assert.deepEqual(r.pts[0], [40, 0]);
  assert.deepEqual(r.pts[r.pts.length - 1], [300, 160]);
  assert.ok(near(r.off[0], 6, 1e-9) && near(r.off[1], 0, 1e-9));
  // both taps on one street: the part of it between them, either way
  const s = RN.route(G, [180, 2], [120, 1]);
  assert.deepEqual(s.pts, [[180, 0], [120, 0]]);
});

test('a weight on the roads (the corridor finder\'s costs) changes the way', () => {
  const G = RN.graph(grid());
  // make y = 0 east of x = 100 ten times dearer: the way goes up and over on y = 100
  const w = e => (e.pts.every(p => p[1] === 0) && e.pts.some(p => p[0] > 100) ? 10 : 1);
  const r = RN.route(G, [0, 0], [300, 0], w);
  assert.ok(r.pts.some(p => p[1] === 100), JSON.stringify(r.pts));
  assert.ok(near(r.L, 500, 1e-6));
  assert.equal(RN.route(RN.graph([{ from: 'a', to: 'b', pts: [[0, 0], [10, 0]] }, { from: 'c', to: 'd', pts: [[500, 0], [510, 0]] }]), [0, 0], [510, 0]), null, 'roads that don\'t join: no route');
});

test('a curved road as straight runs within 3 m of the centreline', () => {
  const arc = Array.from({ length: 61 }, (_, i) => { const a = i / 60 * Math.PI / 2; return [200 * Math.sin(a), 200 - 200 * Math.cos(a)]; });
  const s = RN.simplify(arc);
  assert.ok(s.length > 2 && s.length < 12, `${s.length} runs`);
  for (const p of arc) {
    const d = Math.min(...s.slice(1).map((b, k) => { const a = s[k], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); }));
    assert.ok(d <= RN.TOL + 1e-9);
  }
  assert.deepEqual(RN.simplify([[0, 0], [50, 1], [100, 0]]), [[0, 0], [100, 0]]);
});

test('the source: the ORN Road Net Element on LIO, as probed', () => {
  assert.match(RN.ORN_URL, /LIO_OPEN_DATA\/LIO_Open09\/MapServer\/0$/);
  const probe = JSON.parse(src('data/probe/roads.json'));
  const orn = probe.candidates.find(c => c.service === 'LIO_Open09' && c.id === 0);
  assert.equal(orn.name, 'ORN Road Net Element');
  assert.equal(orn.geometryType, 'esriGeometryPolyline');
  assert.equal(orn.queryCors, 'https://jaredacostar-cmd.github.io');
  assert.ok(orn.fields.includes('FROM_JUNCTION_ID:Double') && orn.fields.includes('TO_JUNCTION_ID:Double'));
});

test('both taps on one road: the way round wins when the stretch between them costs more (the corridor finder\'s weights)', () => {
  const G = RN.graph(grid());
  // y = 0 from x 0 to 100 ten times dearer; taps at x 10 and x 90 on it
  const dear = e => (e.pts.every(p => p[1] === 0) && e.pts.some(p => p[0] === 0) && e.pts.some(p => p[0] === 100) ? 10 : 1);
  const r = RN.route(G, [10, 0], [90, 0], dear);
  // was the direct cut (80 m at 10×: cost 800); round by y = 100: 10 + 100 + 100 + 100 + 10 m on the dear road
  assert.ok(near(r.cost, 10 * 10 + 300 + 10 * 10, 1e-6), `${r.cost}`);
  assert.ok(near(r.L, 320, 1e-6), `${r.L}`);
  assert.ok(r.pts.some(p => p[1] === 100), JSON.stringify(r.pts));
  // unweighted (or cheaper direct): still the part of the road between them, with its cost
  const s = RN.route(G, [10, 0], [90, 0]);
  assert.deepEqual(s.pts, [[10, 0], [90, 0]]);
  assert.ok(near(s.cost, 80, 1e-9));
  const t = RN.route(G, [10, 0], [90, 0], e => (e === G.edges[s.edges[0].e] ? 2 : 1));   // 160 < 500 round
  assert.deepEqual(t.pts, [[10, 0], [90, 0]]);
});
