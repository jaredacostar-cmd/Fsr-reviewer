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

test('PMTiles: an archive too big for one directory gets leaf directories, and every tile reads back', () => {
  const tiles = [];
  // (scattered tiles of scattered sizes, as real buildings tiles are: the directory does not compress away)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let x = 4500; x < 4800; x++) for (let y = 5900; y < 6100; y++) if (rnd() < 0.6) tiles.push({ z: 14, x, y, data: Buffer.from(`t${x},${y}:${'x'.repeat(Math.floor(rnd() * 3000))}`) });
  const buf = PMT.write(tiles, { type: 'mvt', tileCompression: 'none', bounds: [-80.2, 43.4, -79.4, 44.1], metadata: {} });
  const r = PMT.read(buf);
  assert.ok(r.header.leafLength > 0, 'leaf directories');
  assert.ok(r.header.rootLength <= 16384 - 127, 'the root fits in the first 16 KiB');
  assert.ok(r.entries.every(e => e.runLength === 0), 'the root points at leaves');
  assert.equal(r.allEntries().length, tiles.length);
  for (const t of [tiles[0], tiles[777], tiles[20000], tiles[tiles.length - 1]].concat(tiles.filter((_, i) => i % 997 === 0))) assert.equal(r.get(t.z, t.x, t.y).toString(), t.data.toString());
  assert.equal(r.get(14, 4499, 5900), null);
  const missing = []; for (let x = 4500; x < 4800 && missing.length < 5; x++) for (let y = 5900; y < 6100 && missing.length < 5; y++) if (!tiles.some(t => t.x === x && t.y === y)) missing.push([x, y]);
  for (const [x, y] of missing) assert.equal(r.get(14, x, y), null);
  assert.equal(r.get(13, 2250, 2950), null);
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

test('terrain tiles above z15 are upsampled from decoded heights (no byte-carry artefacts)', () => {
  const EL = require('../js/elevation.js');
  const size = 256, px = new Uint8ClampedArray(size * size * 4);
  // A plane crossing a green-channel carry: h = 255.5 + x / 100.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const v = 255.5 + x / 100 + 32768, o = (y * size + x) * 4; px[o] = Math.floor(v / 256); px[o + 1] = Math.floor(v) % 256; px[o + 2] = Math.round((v % 1) * 256); px[o + 3] = 255; }
  const out = EL.upsampleTerrarium(px, 1, 1, 0);   // the right half, doubled
  for (const i of [0, 77, 128, 200, 254]) {
    const o = (10 * size + i) * 4, h = out[o] * 256 + out[o + 1] + out[o + 2] / 256 - 32768;
    const parentX = (256 + i + 0.5) / 2 - 0.5, want = 255.5 + Math.min(255, parentX) / 100;
    assert.ok(Math.abs(h - want) < 0.01, `${i}: ${h} vs ${want}`);
  }
});

test('the service worker leaves byte-range reads and data/3d to the network', () => {
  const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  assert.match(sw, /req\.headers\.has\('range'\)/);
  assert.match(sw, /\\\/data\\\/3d\\\//);
  for (const f of ['js/massing-core.js', 'js/view-3d.js']) assert.ok(sw.includes(`'${f}'`), `${f} in the shell`);
});
