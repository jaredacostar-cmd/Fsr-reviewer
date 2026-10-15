'use strict';
// The 3D view's tile helpers: PMTiles v3 writer / reader, PNG encoder, float32 TIFF reader
// (scripts/lib-pmtiles.js, lib-png.js, lib-tiff.js), and the committed pilot archives when present.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PMT = require('../scripts/lib-pmtiles.js');
const PNG = require('../scripts/lib-png.js');
const TIFF = require('../scripts/lib-tiff.js');
const M = require('../js/massing-core.js');

test('PMTiles tile ids follow the spec (zoom offset + Hilbert order)', () => {
  assert.deepEqual([[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0], [2, 0, 0]].map(([z, x, y]) => PMT.zxyToTileId(z, x, y)), [0, 1, 2, 3, 4, 5]);
  assert.equal(PMT.zxyToTileId(14, 4578, 5970), 124525661);   // checked against the pmtiles library (3.2.1)
});

test('PMTiles: written archive reads back, identical tiles stored once', () => {
  const tiles = [];
  for (let x = 10; x < 14; x++) for (let y = 20; y < 23; y++) tiles.push({ z: 6, x, y, data: Buffer.from(y === 21 ? 'same' : `t${x}${y}`) });
  const buf = PMT.write(tiles, { type: 'png', bounds: [-80, 43, -79, 44], metadata: { attribution: 'x' } });
  const r = PMT.read(buf);
  for (const t of tiles) assert.equal(r.get(t.z, t.x, t.y).toString(), t.data.toString());
  assert.equal(r.get(6, 0, 0), null);
  assert.equal(r.header.addressed, 12); assert.equal(r.header.contents, 9);
  assert.equal(r.header.tileType, PMT.TYPE.png); assert.deepEqual(r.metadata, { attribution: 'x' });
  assert.deepEqual(r.header.bounds, [-80, 43, -79, 44]);
});

test('PNG encoder round-trips through the decoder (terrarium heights survive)', () => {
  const w = 16, h = 16, d = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { const [r, g, b] = M.terrariumEncode(180 + i * 0.13, 0.1); d.set([r, g, b], i * 3); }
  const back = PNG.decode(PNG.encode(w, h, d));
  for (let i = 0; i < w * h; i++) {
    const z = back.data[i * 4] * 256 + back.data[i * 4 + 1] + back.data[i * 4 + 2] / 256 - 32768;
    assert.ok(Math.abs(z - (180 + i * 0.13)) <= 0.05 + 1 / 256, `${i}: ${z}`);
  }
});

test('TIFF float32 reader: values and the no-data value', () => {
  const vals = Float32Array.from({ length: 12 }, (_, i) => i === 5 ? -9999 : 200 + i / 4);
  const t = TIFF.decode(TIFF.encode(4, 3, vals, -9999));
  assert.equal(t.width, 4); assert.equal(t.height, 3); assert.equal(t.noData, -9999);
  assert.deepEqual(Array.from(t.data), Array.from(vals));
});

test('committed pilot archives (when built) are readable, bounded and attributed', () => {
  const dir = path.join(__dirname, '../data/3d');
  const man = path.join(dir, 'manifest.json');
  if (!fs.existsSync(man)) return;
  const m = JSON.parse(fs.readFileSync(man, 'utf8'));
  assert.equal(m.bbox.length, 4);
  for (const k of ['terrain', 'buildings']) {
    const s = m[k]; if (!s || !s.file) continue;
    const r = PMT.read(fs.readFileSync(path.join(dir, s.file)));
    assert.ok(r.header.addressed > 0, `${k}: tiles`);
    assert.ok(r.metadata.attribution, `${k}: attribution`);
    assert.ok(r.header.maxZoom <= 16);
  }
});
